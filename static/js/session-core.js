export const MAX_DOCUMENTS = 50;
export const DEFAULT_ADJUSTMENTS = Object.freeze({brightness:100,contrast:100,saturation:100,warmth:0,hue:0,softness:0});
export function createEditorState(name, width, height) {
  return {loaded:width>0&&height>0,name,width,height,adj:{...DEFAULT_ADJUSTMENTS},strokes:[],elements:[],
    view:{x:0,y:0,w:width,h:height,outW:width,outH:height},cropDraft:null,cropRatio:'free',
    tool:'adjust',selectedEmoji:null,brushSize:64,blurStrength:18,zoom:100,comparing:false,lockAspect:true};
}
export function editorSnapshot(state) {
  return JSON.stringify({adj:state.adj,strokes:state.strokes,elements:state.elements,view:state.view});
}
export class EditorSession {
  constructor() { this.documents=[]; this.activeId=null; }
  get active() { return this.documents.find(doc=>doc.id===this.activeId)||null; }
  add(file, width, height, thumbnail) {
    if(this.documents.length>=MAX_DOCUMENTS)throw Error('La sesión admite hasta 50 fotografías.');
    const state=createEditorState(file.name,width,height),baseline=editorSnapshot(state);
    const doc={id:crypto.randomUUID(),file,state,history:[baseline],historyIndex:0,baseline,
      edited:false,selected:true,thumbnail,outWidth:width,outHeight:height};
    this.documents.push(doc);return doc;
  }
  capture(state, history, historyIndex) {
    const doc=this.active;if(!doc)return;
    doc.state=structuredClone({...state,comparing:false});
    doc.history=history.slice();doc.historyIndex=historyIndex;
    this.markActive(state);
  }
  markActive(state, signature=editorSnapshot(state)) {
    const doc=this.active;if(!doc)return;
    doc.edited=signature!==doc.baseline;doc.outWidth=state.width;doc.outHeight=state.height;
  }
  remove(id) {
    const index=this.documents.findIndex(doc=>doc.id===id);if(index<0)return;
    this.documents.splice(index,1);if(this.activeId===id)this.activeId=null;
  }
  exportJobs() {
    return this.documents.filter(doc=>doc.selected).map(doc=>({id:doc.id,file:doc.file,state:structuredClone(doc.state)}));
  }
}
export function editedOutputName(original, index, format) {
  const stem=original.replace(/\.[^.]+$/,'').normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,100)||'fotografia';
  return `${String(index+1).padStart(2,'0')}_${stem}-fotolab.${format}`;
}
