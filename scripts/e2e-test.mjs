#!/usr/bin/env node
// E2E test runner para el servidor MCP DeonPay.
// Arranca el binario via stdio, hace initialize, y ejecuta una bateria
// de tools/call contra UAT real. Reporta pass/fail por cada tool.
//
// Uso: DEONPAY_API_TOKEN=dp_mcp_xxx DEONPAY_BASE_URL=https://uat.deonpay.mx node scripts/e2e-test.mjs

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const SERVER_BIN = new URL('../dist/index.js', import.meta.url).pathname.slice(1);
const TIMEOUT_MS = 15000;

let nextId = 1;
const pending = new Map();
const results = [];

function send(proc, msg) {
  proc.stdin.write(JSON.stringify(msg) + '\n');
}

function call(proc, method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout ${method}`));
    }, TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    send(proc, { jsonrpc: '2.0', id, method, params });
  });
}

async function runTool(proc, name, args, expect) {
  const t0 = Date.now();
  try {
    const res = await call(proc, 'tools/call', { name, arguments: args });
    const ms = Date.now() - t0;
    const isError = res?.isError === true;
    const text = res?.content?.[0]?.text ?? '';
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }

    const passed = expect(isError, parsed, text);
    results.push({ name, args, ms, passed, isError, text: text.slice(0, 200) });
    process.stdout.write(`  ${passed ? 'PASS' : 'FAIL'}  ${name}  (${ms}ms)\n`);
    if (!passed) {
      process.stdout.write(`        body: ${text.slice(0, 300)}\n`);
    }
    return parsed;
  } catch (err) {
    const ms = Date.now() - t0;
    results.push({ name, args, ms, passed: false, isError: true, text: err.message });
    process.stdout.write(`  FAIL  ${name}  (${ms}ms) - ${err.message}\n`);
    return null;
  }
}

async function main() {
  if (!process.env.DEONPAY_API_TOKEN) {
    console.error('DEONPAY_API_TOKEN required');
    process.exit(1);
  }

  console.log('Spawning MCP server...');
  const proc = spawn(process.execPath, [SERVER_BIN], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: process.env,
  });

  let buf = '';
  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let newline;
    while ((newline = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, newline).trim();
      buf = buf.slice(newline + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && pending.has(msg.id)) {
          const { resolve, timer } = pending.get(msg.id);
          clearTimeout(timer);
          pending.delete(msg.id);
          resolve(msg.result ?? msg);
        }
      } catch (e) {
        console.error('parse err:', line);
      }
    }
  });

  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error('server exited code', code);
  });

  // Espera arranque
  await sleep(300);

  console.log('initialize...');
  await call(proc, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'e2e-test', version: '0' },
  });
  send(proc, { jsonrpc: '2.0', method: 'notifications/initialized' });
  await sleep(100);

  console.log('\n=== READ-ONLY TOOLS ===');
  await runTool(proc, 'deonpay_get_merchant_metrics', { period: '30d' },
    (err, p) => !err && p?.data?.revenue !== undefined);

  await runTool(proc, 'deonpay_list_links', { limit: 5 },
    (err, p) => !err && Array.isArray(p?.data));

  await runTool(proc, 'deonpay_list_transactions', { limit: 3 },
    (err, p) => !err && Array.isArray(p?.data));

  await runTool(proc, 'deonpay_list_products', { limit: 5 },
    (err, p) => !err && Array.isArray(p?.data));

  await runTool(proc, 'deonpay_list_subscriptions', { limit: 5 },
    (err, p) => !err && Array.isArray(p?.data));

  await runTool(proc, 'deonpay_list_customer_subscriptions', { limit: 5 },
    (err, p) => !err && Array.isArray(p?.data));

  await runTool(proc, 'deonpay_list_customers', { limit: 5 },
    (err, p) => !err && Array.isArray(p?.data));

  console.log('\n=== WRITE TOOLS (create only - no destructive) ===');

  const linkRes = await runTool(proc, 'deonpay_create_link', {
    name: `MCP E2E Link ${Date.now()}`,
    type: 'single',
    line_items: [{ name: 'Test item E2E', quantity: 1, unit_amount: 12345 }],
  }, (err, p) => !err && (p?.id || p?.data?.id));

  const linkId = linkRes?.id ?? linkRes?.data?.id;
  if (linkId) {
    await runTool(proc, 'deonpay_get_link', { id: linkId },
      (err, p) => !err && (p?.id === linkId || p?.data?.id === linkId));

    await runTool(proc, 'deonpay_update_link', {
      id: linkId,
      name: `MCP E2E Link UPDATED ${Date.now()}`,
    }, (err, p) => !err && (p?.name?.includes('UPDATED') || p?.data?.name?.includes('UPDATED')));
  }

  const productRes = await runTool(proc, 'deonpay_create_product', {
    name: `MCP E2E Product ${Date.now()}`,
    description: 'Producto de prueba E2E del MCP',
    unit_amount: 99900,
    sku: `MCP-E2E-${Date.now()}`,
  }, (err, p) => !err && (p?.id || p?.data?.id));

  const productId = productRes?.id ?? productRes?.data?.id;
  if (productId) {
    await runTool(proc, 'deonpay_update_product', {
      id: productId,
      description: 'Descripcion actualizada via MCP',
    }, (err, p) => !err && (p?.description?.includes('actualizada') || p?.data?.description?.includes('actualizada')));
  }

  await runTool(proc, 'deonpay_create_checkout_session', {
    line_items: [{ name: 'Checkout E2E', quantity: 1, unit_amount: 50000 }],
    success_url: 'https://example.com/ok',
    cancel_url: 'https://example.com/cancel',
  }, (err, p) => !err && (p?.session_id?.startsWith('cs_') || p?.data?.session_id?.startsWith('cs_')));

  const subRes = await runTool(proc, 'deonpay_create_subscription', {
    name: `MCP E2E Plan ${Date.now()}`,
    amount: 19900,
    interval_type: 'monthly',
    description: 'Plan de prueba del MCP E2E',
  }, (err, p) => !err && (p?.id || p?.data?.id));

  const subId = subRes?.id ?? subRes?.data?.id;
  if (subId) {
    await runTool(proc, 'deonpay_get_subscription', { id: subId },
      (err, p) => !err && (p?.id === subId || p?.data?.id === subId));
  }

  console.log('\n=== ERROR HANDLING ===');
  await runTool(proc, 'deonpay_get_link', { id: '00000000-0000-0000-0000-000000000000' },
    (err, p, t) => err && (t.includes('not found') || t.includes('404')));

  await runTool(proc, 'deonpay_create_link', {
    name: '',
    type: 'single',
    line_items: [{ name: 'x', quantity: 1, unit_amount: 100 }],
  }, (err, p, t) => err);

  proc.kill();
  await sleep(200);

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== RESUMEN ===`);
  console.log(`Total: ${total}  Pass: ${passed}  Fail: ${failed}`);
  if (failed > 0) {
    console.log('\nFallos:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.text}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
