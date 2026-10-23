import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {DEFAULT_MARK, markRect, outputName, validateMark} from '../static/js/batch-core.js';
import {ZipArchive} from '../static/js/batch-zip.js';

test('proportional placement survives resolution changes in portrait and panorama', () => {
  for (const [width, height] of [[4000,1000], [1000,4000]]) {
    const original = markRect(width, height, 400, 100, DEFAULT_MARK);
    const preview = markRect(width / 4, height / 4, 400, 100, DEFAULT_MARK);
    for (const key of ['x','y','w','h']) assert.equal(original[key], preview[key] * 4);
    assert.equal(width - original.x - original.w, 30);
    assert.equal(height - original.y - original.h, 30);
    assert.equal(original.w / original.h, 4);
  }
});

test('all anchors and free placement keep tall logos inside the photo', () => {
  for (const ax of [0, .5, 1]) for (const ay of [0, .5, 1]) {
    const rect = markRect(3000, 800, 100, 2000, {...DEFAULT_MARK, size:100, ax, ay});
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.x + rect.w <= 3000 && rect.y + rect.h <= 800);
    assert.equal(rect.h / rect.w, 20);
  }
  const free = markRect(1000, 2000, 200, 100, {...DEFAULT_MARK, x:0, y:1});
  assert.equal(free.x, 0); assert.equal(free.y + free.h, 2000);
});

test('presets reject invalid numbers and preserve full transparency', () => {
  assert.equal(validateMark({...DEFAULT_MARK, opacity:0}).opacity, 0);
  for (const invalid of [{size:NaN}, {opacity:101}, {x:-1}, {y:undefined}, {margin:Infinity}]) {
    assert.throws(() => validateMark({...DEFAULT_MARK, ...invalid}));
  }
});

test('duplicate input filenames yield unique safe archive entries', () => {
  assert.notEqual(outputName('foto.jpg', 0, 'png'), outputName('foto.jpg', 1, 'png'));
  assert.equal(outputName('../niño.jpg', 0, 'webp'), '01_.._niño_marca.webp');
  assert.equal(outputName('foto.jpg', 49, 'jpg'), '50_foto_marca.jpg');
});

test('ZIP interoperates with Python zipfile, including UTF-8, CRC and 50 entries', async () => {
  const zip = new ZipArchive();
  for (let index = 0; index < 50; index++) await zip.add(outputName('niño.jpg', index, 'png'), new Blob([`pixels-${index}`]));
  const bytes = new Uint8Array(await zip.finish().arrayBuffer());
  const result = spawnSync(process.env.PYTHON || 'python3', ['-c',
    'import sys,zipfile,io; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert len(z.namelist())==50; assert z.testzip() is None; assert z.read("01_niño_marca.png")==b"pixels-0"; assert z.read("50_niño_marca.png")==b"pixels-49"'], {input:bytes});
  assert.equal(result.status, 0, result.stderr?.toString());
});

test('cancelled ZIP entry is not retained and oversized archive is rejected', async () => {
  const zip = new ZipArchive(), controller = new AbortController();
  controller.abort();
  await assert.rejects(zip.add('cancel.png', new Blob(['pixels']), controller.signal), {name:'AbortError'});
  assert.equal(zip.entries.length, 0);
  await assert.rejects(zip.add('big.png', {size:513 * 1024 * 1024}), /512 MB/);
});
