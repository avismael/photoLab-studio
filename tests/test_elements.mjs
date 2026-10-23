import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FONT_FAMILIES, reorderElement, textFont, textLayout, resizeHandles, resizeElement} from '../static/js/elements-core.js';

test('mixed element ordering is immutable and preserves asset references', () => {
  const items = [{id:1,kind:'shape'}, {id:2,kind:'text'}, {id:3,kind:'sticker',assetId:7}];
  const moved = reorderElement(items, 3, 'back');
  assert.deepEqual(moved.map(item => item.id), [3,1,2]);
  assert.deepEqual(items.map(item => item.id), [1,2,3]);
  assert.strictEqual(moved[0], items[2]);
  assert.deepEqual(reorderElement(moved, 3, 'front'), items);
  assert.deepEqual(reorderElement(items, 2, 'down').map(item => item.id), [2,1,3]);
  assert.deepEqual(reorderElement(items, 2, 'up').map(item => item.id), [1,3,2]);
  assert.deepEqual(reorderElement(items, 1, 'down'), items);
  assert.deepEqual(reorderElement(items, 3, 'up'), items);
  assert.strictEqual(reorderElement(items, 99, 'up'), items);
});

test('multiline text retains blank lines and scales proportionally with font size', () => {
  const context = {font:'', measureText(text) { return {width:text.length * Number(this.font.match(/([\d.]+)px/)[1]) * .5}; }};
  const item = {text:'Áéñ\n\nHola mundo',font:'Inter',size:40,bold:false,italic:false};
  const layout = textLayout(context,item), bigger = textLayout(context,{...item,size:80});
  assert.deepEqual(layout.lines, ['Áéñ','','Hola mundo']);
  assert.ok(layout.w > 0 && layout.h > item.size * 2);
  assert.equal(bigger.w,layout.w * 2); assert.equal(bigger.h,layout.h * 2);
  const empty = textLayout(context,{...item,text:''});
  assert.ok(empty.w > 0 && empty.h > 0, 'empty text remains selectable');
});

test('font specifications use safe families and supported weights', () => {
  assert.equal(textFont({font:'Lora',size:64,bold:true,italic:true}), 'italic 700 64px "Lora"');
  assert.equal(textFont({font:'Bebas Neue',size:64,bold:true}), '400 64px "Bebas Neue"');
  assert.equal(textFont({font:'unknown',size:64}), '400 64px "Inter"');
});

test('every declared self-hosted font and license ships as a real local asset', () => {
  const root = new URL('../static/fonts/',import.meta.url);
  const css = readFileSync(new URL('fonts.css',root),'utf8');
  const filenames = [...css.matchAll(/url\('([^']+)'\)/g)].map(match => match[1]);
  assert.equal(filenames.length,13);
  for (const name of filenames) {
    const bytes = readFileSync(new URL(name,root));
    assert.equal(bytes.readUInt32BE(0),0x00010000,name);
    const license = readFileSync(new URL(name.replace('.ttf','-OFL.txt'),root),'utf8');
    assert.match(license,/SIL OPEN FONT LICENSE Version 1.1/);
  }
  for(const family of FONT_FAMILIES) assert.ok(css.includes(family),family);
});

const limits = {minW:1,maxW:10000,minH:1,maxH:10000,minSize:8,maxSize:1200};
const near = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
test('rotated corner resizing keeps the opposite corner anchored', () => {
  for(const rotation of [0,30,90,145,270]) {
    const item = {kind:'shape',shape:'rect',x:300,y:250,width:200,height:100,rotation};
    const box = {w:200,h:100}, handles = resizeHandles(item,box), anchor = handles[0], dragged = handles[4];
    const angle = rotation*Math.PI/180;
    const delta = {x:100*Math.cos(angle)-50*Math.sin(angle),y:100*Math.sin(angle)+50*Math.cos(angle)};
    const result = {...item,...resizeElement(item,box,dragged,delta,limits)};
    near(result.width,300);near(result.height,150);
    const anchored = resizeHandles(result,{w:result.width,h:result.height})[0];
    near(anchor.x,anchored.x);near(anchor.y,anchored.y);
  }
});

test('side handles stretch only one shape dimension; Shift preserves ratio', () => {
  const item = {kind:'shape',shape:'ellipse',x:200,y:100,width:200,height:100,rotation:0};
  const box = {w:200,h:100}, right = resizeHandles(item,box)[3];
  const stretched = resizeElement(item,box,right,{x:100,y:90},limits);
  assert.equal(stretched.width,300);assert.equal(stretched.height,100);assert.equal(stretched.y,100);
  const proportional = resizeElement(item,box,right,{x:100,y:90},limits,true);
  assert.equal(proportional.width/proportional.height,2);
  const crossed = resizeElement(item,box,right,{x:-1000,y:0},limits);
  assert.equal(crossed.width,1);assert.equal(crossed.height,100);
});

test('text and sticker corners scale their size without deforming', () => {
  for(const kind of ['text','sticker','emoji']) {
    const item = {kind,x:100,y:100,size:40,rotation:0};
    const box = {w:200,h:100}, handle = resizeHandles(item,box)[2];
    const resized = resizeElement(item,box,handle,{x:100,y:50},limits);
    assert.equal(resized.size,60);
    assert.equal(resized.x,150);assert.equal(resized.y,125);
    assert.ok(!('width' in resized));
    const tiny = resizeElement(item,box,handle,{x:-10000,y:-10000},limits);
    assert.equal(tiny.size,8);
  }
});

test('lines expose only two endpoints and retain their thickness geometry', () => {
  const item = {kind:'shape',shape:'line',x:100,y:100,width:100,height:30,rotation:0};
  const handles = resizeHandles(item,{w:100,h:0});
  assert.equal(handles.length,2);
  const result = resizeElement(item,{w:100,h:0},handles[1],{x:50,y:80},limits,true);
  assert.equal(result.width,150);assert.equal(result.height,30);assert.equal(result.y,100);
});
