import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession, createEditorState, editorSnapshot, editedOutputName, MAX_DOCUMENTS} from '../static/js/session-core.js';

test('documents isolate nested edits, crop, strokes, selection and undo/redo history',()=>{
  const session=new EditorSession(),a=session.add({name:'a.jpg'},1200,400,''),b=session.add({name:'b.jpg'},400,1200,'');
  session.activeId=a.id;
  const state=structuredClone(a.state);
  state.adj.brightness=130;state.elements.push({id:1,kind:'text',text:'A'});state.strokes.push({points:[[10,20]]});
  state.view={x:100,y:50,w:600,h:300,outW:900,outH:450};state.width=900;state.height=450;state.zoom=150;state.selectedEmoji=1;state.lockAspect=false;
  const history=[a.baseline,editorSnapshot(state),'redo-state'];
  session.capture(state,history,1);
  state.elements[0].text='mutated';state.strokes[0].points[0][0]=99;history.pop();
  assert.equal(a.state.elements[0].text,'A');assert.equal(a.state.strokes[0].points[0][0],10);
  assert.equal(a.state.zoom,150);assert.equal(a.state.selectedEmoji,1);assert.equal(a.history.length,3);assert.equal(a.historyIndex,1);
  assert.equal(a.state.lockAspect,false);assert.equal(b.state.lockAspect,true);
  assert.deepEqual(a.state.view,{x:100,y:50,w:600,h:300,outW:900,outH:450});
  assert.equal(b.state.adj.brightness,100);assert.deepEqual(b.state.elements,[]);assert.deepEqual(b.state.strokes,[]);
  assert.equal(a.edited,true);assert.equal(b.edited,false);
});

test('export jobs include only checked documents and freeze independent edit snapshots',()=>{
  const session=new EditorSession(),a=session.add({name:'same.jpg'},300,200,''),b=session.add({name:'same.jpg'},200,300,'');
  session.activeId=a.id;const state=structuredClone(a.state);state.elements.push({id:7,kind:'sticker',assetId:11});
  session.capture(state,[a.baseline,editorSnapshot(state)],1);b.selected=false;
  const jobs=session.exportJobs();assert.equal(jobs.length,1);assert.strictEqual(jobs[0].file,a.file);
  jobs[0].state.elements[0].assetId=99;assert.equal(a.state.elements[0].assetId,11);
  a.state.adj.contrast=20;assert.equal(jobs[0].state.adj.contrast,100);
});

test('returning pixels to the original state clears the edited badge without clearing other images',()=>{
  const session=new EditorSession(),a=session.add({name:'a.png'},300,200,''),b=session.add({name:'b.png'},200,300,'');
  session.activeId=a.id;const state=structuredClone(a.state);state.adj.hue=80;session.markActive(state);assert.equal(a.edited,true);
  state.adj.hue=0;state.tool='text';state.zoom=200;session.markActive(state);assert.equal(a.edited,false);
  session.remove(b.id);assert.equal(session.activeId,a.id);assert.equal(session.documents.length,1);
  session.remove(a.id);assert.equal(session.active,null);assert.equal(session.documents.length,0);
});

test('sessions enforce 50 files and exported duplicate names remain safe and unique',()=>{
  const session=new EditorSession();for(let i=0;i<MAX_DOCUMENTS;i++)session.add({name:'same.jpg'},1,1,'');
  assert.throws(()=>session.add({name:'extra.jpg'},1,1,''),/50/);
  const names=session.exportJobs().map((job,index)=>editedOutputName(job.file.name,index,'png'));
  assert.equal(new Set(names).size,50);assert.equal(names[49],'50_same-fotolab.png');
  assert.ok(!editedOutputName('../niño.jpg',0,'png').includes('/'));
  const empty=createEditorState('',0,0);assert.equal(empty.loaded,false);
});
