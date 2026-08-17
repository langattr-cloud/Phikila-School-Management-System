import { Hono } from 'hono'
import { db } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { jsonError } from '../lib/http'

export const inventoryRoutes = new Hono()

inventoryRoutes.get('/items', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('inventory_items').select('*').order('name')
  return c.json(data ?? [])
})

inventoryRoutes.get('/items/stats', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const { data } = await db().from('inventory_items').select('quantity, low_stock_threshold, unit_price')
  let totalValue = 0
  let lowStock = 0
  let totalUnits = 0
  for (const item of data ?? []) {
    totalUnits += item.quantity ?? 0
    totalValue += (item.quantity ?? 0) * (item.unit_price ?? 0)
    if ((item.quantity ?? 0) <= (item.low_stock_threshold ?? 0)) lowStock += 1
  }
  return c.json({ total_items: data?.length ?? 0, total_units: totalUnits, total_value: totalValue, low_stock: lowStock })
})

inventoryRoutes.post('/items', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const client = db()
  const { data, error: insertError } = await client.from('inventory_items').insert(body).select().single()
  if (insertError) return jsonError(c, insertError.message, 400)
  if (body.quantity) {
    await client.from('inventory_movements').insert({
      item_id: data.id,
      quantity: body.quantity,
      movement_type: 'inbound',
      note: 'Initial stock',
    })
  }
  return c.json(data, 201)
})

inventoryRoutes.get('/items/:itemId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const client = db()
  const itemId = c.req.param('itemId')
  const { data } = await client.from('inventory_items').select('*').eq('id', itemId).maybeSingle()
  if (!data) return c.json({ detail: 'Item not found.' }, 404)
  const { data: movements } = await client.from('inventory_movements').select('*').eq('item_id', itemId).order('created_at', { ascending: false })
  return c.json({ ...data, movements: movements ?? [] })
})

inventoryRoutes.patch('/items/:itemId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const { data, error: updateError } = await db()
    .from('inventory_items')
    .update(body)
    .eq('id', c.req.param('itemId'))
    .select()
    .maybeSingle()
  if (updateError) return jsonError(c, updateError.message, 400)
  return c.json(data)
})

inventoryRoutes.delete('/items/:itemId', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  await db().from('inventory_items').delete().eq('id', c.req.param('itemId'))
  return c.body(null, 204)
})

/** Adjust stock and record a movement. */
inventoryRoutes.post('/items/:itemId/movements', async (c) => {
  const { error } = requireAuth(c as never)
  if (error) return error
  const body = await c.req.json().catch(() => ({}))
  const client = db()
  const itemId = c.req.param('itemId')
  const quantity = Number(body.quantity ?? 0)
  const movementType = body.movement_type === 'outbound' ? -1 : 1
  const delta = quantity * movementType

  const { data: item } = await client.from('inventory_items').select('quantity').eq('id', itemId).maybeSingle()
  if (!item) return c.json({ detail: 'Item not found.' }, 404)
  const newQuantity = Math.max(0, (item.quantity ?? 0) + delta)

  const { data: movement, error: movementError } = await client
    .from('inventory_movements')
    .insert({
      item_id: itemId,
      quantity,
      movement_type: body.movement_type ?? 'inbound',
      note: body.note ?? null,
    })
    .select()
    .single()
  if (movementError) return jsonError(c, movementError.message, 400)

  const { data: updated } = await client.from('inventory_items').update({ quantity: newQuantity }).eq('id', itemId).select().single()
  return c.json({ movement, item: updated }, 201)
})