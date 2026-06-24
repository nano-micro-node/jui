'use strict';

/* ═══════════════════════════════════════════════════
   WebDB API
   ═══════════════════════════════════════════════════ */
class WebDBAPI{constructor(){this._cache={}}async _openDB(n){if(this._cache[n])return this._cache[n];return new Promise((res,rej)=>{const r=indexedDB.open(n,1);r.onerror=()=>rej(new Error(`Cannot open DB "${n}": ${r.error?.message}`));r.onsuccess=()=>{this._cache[n]=r.result;r.result.onclose=()=>delete this._cache[n];res(r.result)};r.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'id'})}})}_uuid(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16)})}_sizeOf(c){if(c instanceof Blob)return c.size;if(typeof c==='string')return c.length;try{return JSON.stringify(c).length}catch{return 0}}async _getAll(db){return new Promise((res,rej)=>{const tx=db.transaction('files','readonly'),s=tx.objectStore('files'),r=s.getAll();r.onerror=()=>rej(r.error);r.onsuccess=()=>res(r.result||[])})}async _addRecord(db,item){return new Promise((res,rej)=>{const tx=db.transaction('files','readwrite'),s=tx.objectStore('files'),r=s.add(item);r.onerror=()=>rej(r.error);r.onsuccess=()=>res(r.result);tx.onerror=()=>rej(tx.error)})}async _putRecord(db,item){return new Promise((res,rej)=>{const tx=db.transaction('files','readwrite'),s=tx.objectStore('files'),r=s.put(item);r.onerror=()=>rej(r.error);r.onsuccess=()=>res(r.result);tx.onerror=()=>rej(tx.error)})}async _deleteRecord(db,id){return new Promise((res,rej)=>{const tx=db.transaction('files','readwrite'),s=tx.objectStore('files'),r=s.delete(id);r.onerror=()=>rej(r.error);r.onsuccess=()=>res(true);tx.onerror=()=>rej(tx.error)})}_parsePath(p){if(typeof p!=='string'||!p.trim())throw new Error('Path must be a non-empty string');const pts=p.replace(/^\/+|\/+$/g,'').split('/').map(s=>s.trim()).filter(Boolean);if(!pts.length)throw new Error(`Invalid path: "${p}"`);return{dbName:pts[0],segments:pts.slice(1)}}_findFile(all,fn,pid){return all.find(i=>i.type==='file'&&i.filename===fn&&i.parent===pid)||null}_findFolder(all,n,pid){return all.find(i=>i.type==='folder'&&(i.name===n||i.filename===n)&&i.parent===pid)||null}async _resolveFolderPath(db,segs,create=false,allItems=null){if(!segs.length)return null;const all=allItems||await this._getAll(db);let pid=null;for(const seg of segs){const ex=all.find(i=>i.type==='folder'&&(i.name===seg||i.filename===seg)&&i.parent===pid);if(ex){pid=ex.id}else if(create){const f={id:this._uuid(),name:seg,filename:seg,type:'folder',parent:pid,size:0,created:Date.now(),modified:Date.now()};await this._addRecord(db,f);all.push(f);pid=f.id}else throw new Error(`Folder not found: "${seg}"`)}return pid}async createDB(n){if(!n||typeof n!=='string')throw new Error('DB name required');await this._openDB(n);return{success:true,db:n}}async listDBs(){if(typeof indexedDB.databases!=='function')throw new Error('Not supported');const dbs=await indexedDB.databases();return dbs.map(d=>({name:d.name,version:d.version}))}async list(path){const{dbName,segments}=this._parsePath(path);const db=await this._openDB(dbName);const all=await this._getAll(db);const pid=segments.length>0?await this._resolveFolderPath(db,segments,false,all):null;return all.filter(i=>i.parent===pid).map(i=>({name:i.filename||i.name,type:i.type,size:i.size||0,created:i.created,modified:i.modified,id:i.id}))}async read(path){const{dbName,segments}=this._parsePath(path);if(!segments.length)throw new Error(`Not a file: "${path}"`);const fn=segments[segments.length-1],fsegs=segments.slice(0,-1);const db=await this._openDB(dbName);const all=await this._getAll(db);const pid=await this._resolveFolderPath(db,fsegs,false,all);const f=this._findFile(all,fn,pid);if(!f)throw new Error(`Not found: "${path}"`);return{path,filename:f.filename,content:f.content,size:f.size,created:f.created,modified:f.modified,id:f.id}}async write(path,content){const{dbName,segments}=this._parsePath(path);if(!segments.length)throw new Error(`Not a file path: "${path}"`);const fn=segments[segments.length-1],fsegs=segments.slice(0,-1);const db=await this._openDB(dbName);const all=await this._getAll(db);const pid=await this._resolveFolderPath(db,fsegs,true,all);if(this._findFile(all,fn,pid))throw new Error(`File exists: "${path}". Use upsert().`);const rec={id:this._uuid(),filename:fn,content,parent:pid,type:'file',size:this._sizeOf(content),created:Date.now(),modified:Date.now()};await this._addRecord(db,rec);return{success:true,path,id:rec.id}}async upsert(path,content){const{dbName,segments}=this._parsePath(path);if(!segments.length)throw new Error(`Not a file path: "${path}"`);const fn=segments[segments.length-1],fsegs=segments.slice(0,-1);const db=await this._openDB(dbName);const all=await this._getAll(db);const pid=await this._resolveFolderPath(db,fsegs,true,all);const ex=this._findFile(all,fn,pid);const rec={id:ex?ex.id:this._uuid(),filename:fn,content,parent:pid,type:'file',size:this._sizeOf(content),created:ex?ex.created:Date.now(),modified:Date.now()};await this._putRecord(db,rec);return{success:true,path,id:rec.id,created:!ex}}async delete(path){const{dbName,segments}=this._parsePath(path);if(!segments.length)throw new Error(`Not a file path: "${path}"`);const fn=segments[segments.length-1],fsegs=segments.slice(0,-1);const db=await this._openDB(dbName);const all=await this._getAll(db);const pid=await this._resolveFolderPath(db,fsegs,false,all);const f=this._findFile(all,fn,pid);if(!f)throw new Error(`Not found: "${path}"`);await this._deleteRecord(db,f.id);return{success:true,path,deleted:fn}}async exists(path){try{const{dbName,segments}=this._parsePath(path);const db=await this._openDB(dbName);const all=await this._getAll(db);if(!segments.length)return true;const n=segments[segments.length-1],ps=segments.slice(0,-1);const pid=await this._resolveFolderPath(db,ps,false,all);return!!(this._findFile(all,n,pid)||this._findFolder(all,n,pid))}catch{return false}}}
const webdb=new WebDBAPI();

/* ═══════════════════════════════════════════════════
   json_path helpers
   ═══════════════════════════════════════════════════ */
function _parseSeg(p){const d=p.indexOf('-');return d===-1?{key:p,id:null}:{key:p.slice(0,d),id:p.slice(d+1)}}
function _findById(arr,mid){return arr.find(e=>e!=null&&String(e.id)===mid)}
function jsonReadPath(json,path){let doc;if(typeof json==='string'){try{doc=JSON.parse(json)}catch{return undefined}}else doc=json;const parts=path.split('.');let cur=doc;for(const p of parts){if(cur==null||typeof cur!=='object')return undefined;const{key,id}=_parseSeg(p);if(id!==null){const arr=cur[key];if(!Array.isArray(arr))return undefined;cur=_findById(arr,id)}else cur=cur[key];if(cur===undefined)return undefined}return cur}
function jsonWritePath(json,path,value){const rs=typeof json==='string';let doc;if(rs){try{doc=JSON.parse(json)}catch{doc={}}}else doc=JSON.parse(JSON.stringify(json??{}));const parts=path.split('.');if(!parts.length)return rs?JSON.stringify(doc):doc;const ints=parts.slice(0,-1),last=parts[parts.length-1];let cur=doc;for(const p of ints){const{key,id}=_parseSeg(p);if(id!==null){if(!Array.isArray(cur[key]))cur[key]=[];const arr=cur[key];let f=_findById(arr,id);if(!f){f={id};arr.push(f)}cur=f}else{if(cur[key]==null||typeof cur[key]!=='object'||Array.isArray(cur[key]))cur[key]={};cur=cur[key]}}const{key:lk,id:li}=_parseSeg(last);if(li!==null){if(!Array.isArray(cur[lk]))cur[lk]=[];const arr=cur[lk];let f=_findById(arr,li);if(!f){f={id:li};arr.push(f)}f.value=value}else cur[lk]=value;return rs?JSON.stringify(doc):doc}

/* ═══════════════════════════════════════════════════
   COMPONENT PALETTE DEFINITIONS
   ═══════════════════════════════════════════════════ */
const PALETTE = [
  // ── Layout ──────────────────────────────────────────
  {cat:'layout',group:'Layout',type:'div',icon:'bi-square',name:'Div',sub:'generic block'},
  {cat:'layout',type:'container',icon:'bi-layout-text-sidebar',name:'Container',sub:'bs container'},
  {cat:'layout',type:'container-fluid',icon:'bi-fullscreen',name:'Container Fluid',sub:'full-width'},
  {cat:'layout',type:'row',icon:'bi-layout-three-columns',name:'Row',sub:'bs grid row'},
  {cat:'layout',type:'col',icon:'bi-layout-sidebar',name:'Column',sub:'bs col'},
  {cat:'layout',type:'flexbox',icon:'bi-distribute-horizontal',name:'Flexbox',sub:'d-flex layout'},
  {cat:'layout',type:'grid',icon:'bi-grid',name:'Grid',sub:'CSS grid'},
  {cat:'layout',type:'section',icon:'bi-bounding-box',name:'Section',sub:'<section>'},
  {cat:'layout',type:'article',icon:'bi-file-text',name:'Article',sub:'<article>'},
  {cat:'layout',type:'aside',icon:'bi-layout-sidebar-reverse',name:'Aside',sub:'sidebar'},
  {cat:'layout',type:'header',icon:'bi-calendar3-event',name:'Header',sub:'page header'},
  {cat:'layout',type:'footer',icon:'bi-layout-wtf',name:'Footer',sub:'page footer'},
  {cat:'layout',type:'main',icon:'bi-star',name:'Main',sub:'main content'},
  {cat:'layout',type:'card',icon:'bi-card-heading',name:'Card',sub:'bs card'},
  {cat:'layout',type:'card-header',icon:'bi-card-list',name:'Card Header',sub:'bs card-header'},
  {cat:'layout',type:'card-body',icon:'bi-card-text',name:'Card Body',sub:'bs card-body'},
  {cat:'layout',type:'card-footer',icon:'bi-card-checklist',name:'Card Footer',sub:'bs card-footer'},
  {cat:'layout',type:'accordion',icon:'bi-chevron-bar-down',name:'Accordion',sub:'bs collapse'},
  {cat:'layout',type:'modal',icon:'bi-window-fullscreen',name:'Modal',sub:'bs modal'},
  {cat:'layout',type:'offcanvas',icon:'bi-layout-sidebar-inset',name:'Offcanvas',sub:'bs offcanvas'},
  {cat:'layout',type:'tabs',icon:'bi-folder2',name:'Tabs',sub:'bs tabs'},
  {cat:'layout',type:'pills',icon:'bi-circle',name:'Pills Nav',sub:'bs nav-pills'},
  {cat:'layout',type:'jumbotron',icon:'bi-arrows-fullscreen',name:'Hero',sub:'hero/jumbotron'},
  {cat:'layout',type:'split',icon:'bi-layout-split',name:'Split',sub:'two-column split'},
  {cat:'layout',type:'stack',icon:'bi-stack',name:'Stack',sub:'bs vstack/hstack'},
  {cat:'layout',type:'wrap',icon:'bi-arrow-return-left',name:'Wrap',sub:'flex-wrap'},
  {cat:'layout',type:'details',icon:'bi-chevron-down-circle',name:'Details',sub:'<details> collapse'},
  {cat:'layout',type:'layout-left-sidebar',icon:'bi-layout-sidebar',name:'Left Sidebar',sub:'full layout block'},
  {cat:'layout',type:'layout-right-sidebar',icon:'bi-layout-sidebar-reverse',name:'Right Sidebar',sub:'full layout block'},
  {cat:'layout',type:'layout-dashboard',icon:'bi-speedometer2',name:'Dashboard',sub:'iot layout block'},
  // ── Text ────────────────────────────────────────────
  {cat:'text',group:'Text & Headings',type:'h1',icon:'bi-type-h1',name:'H1',sub:'heading 1'},
  {cat:'text',type:'h2',icon:'bi-type-h2',name:'H2',sub:'heading 2'},
  {cat:'text',type:'h3',icon:'bi-type-h3',name:'H3',sub:'heading 3'},
  {cat:'text',type:'h4',icon:'bi-type-h4',name:'H4',sub:'heading 4'},
  {cat:'text',type:'h5',icon:'bi-type-h5',name:'H5',sub:'heading 5'},
  {cat:'text',type:'h6',icon:'bi-type-h6',name:'H6',sub:'heading 6'},
  {cat:'text',type:'p',icon:'bi-paragraph',name:'Paragraph',sub:'<p> text'},
  {cat:'text',type:'span',icon:'bi-type',name:'Span',sub:'inline text'},
  {cat:'text',type:'label',icon:'bi-tag',name:'Label',sub:'form label'},
  {cat:'text',type:'blockquote',icon:'bi-quote',name:'Blockquote',sub:'quote block'},
  {cat:'text',type:'code',icon:'bi-code',name:'Code',sub:'inline code'},
  {cat:'text',type:'pre',icon:'bi-code-square',name:'Pre',sub:'code block'},
  {cat:'text',type:'hr',icon:'bi-dash-lg',name:'Divider',sub:'<hr>'},
  {cat:'text',type:'ul',icon:'bi-list-ul',name:'List UL',sub:'unordered list'},
  {cat:'text',type:'ol',icon:'bi-list-ol',name:'List OL',sub:'ordered list'},
  {cat:'text',type:'li',icon:'bi-dash',name:'List Item',sub:'<li>'},
  {cat:'text',type:'strong',icon:'bi-type-bold',name:'Bold',sub:'<strong>'},
  {cat:'text',type:'em',icon:'bi-type-italic',name:'Italic',sub:'<em>'},
  {cat:'text',type:'small',icon:'bi-fonts',name:'Small',sub:'<small>'},
  {cat:'text',type:'mark',icon:'bi-highlighter',name:'Highlight',sub:'<mark>'},
  {cat:'text',type:'abbr',icon:'bi-alphabet',name:'Abbr',sub:'<abbr> tooltip'},
  {cat:'text',type:'kbd',icon:'bi-keyboard',name:'Keyboard',sub:'<kbd> shortcut'},
  {cat:'text',type:'del',icon:'bi-type-strikethrough',name:'Strikethrough',sub:'<del>'},
  {cat:'text',type:'sub',icon:'bi-arrow-down-square',name:'Subscript',sub:'<sub>'},
  {cat:'text',type:'sup',icon:'bi-arrow-up-square',name:'Superscript',sub:'<sup>'},
  {cat:'text',type:'time',icon:'bi-clock',name:'Time',sub:'<time> element'},
  {cat:'text',type:'address',icon:'bi-geo-alt',name:'Address',sub:'<address>'},
  {cat:'text',type:'cite',icon:'bi-bookmark',name:'Citation',sub:'<cite>'},
  {cat:'text',type:'dfn',icon:'bi-info-circle',name:'Definition',sub:'<dfn>'},
  {cat:'text',type:'samp',icon:'bi-terminal',name:'Sample',sub:'<samp> output'},
  {cat:'text',type:'var',icon:'bi-x-diamond',name:'Variable',sub:'<var>'},
  {cat:'text',type:'bdi',icon:'bi-translate',name:'BDI',sub:'bi-directional isolate'},
  // ── Form ────────────────────────────────────────────
  {cat:'form',group:'Form Elements',type:'form',icon:'bi-ui-checks',name:'Form',sub:'<form>'},
  {cat:'form',type:'fieldset',icon:'bi-collection',name:'Fieldset',sub:'<fieldset>'},
  {cat:'form',type:'legend',icon:'bi-card-heading',name:'Legend',sub:'<legend>'},
  {cat:'form',type:'input',icon:'bi-input-cursor-text',name:'Input',sub:'text input'},
  {cat:'form',type:'textarea',icon:'bi-textarea',name:'Textarea',sub:'multiline text'},
  {cat:'form',type:'select',icon:'bi-chevron-bar-down',name:'Select',sub:'<select>'},
  {cat:'form',type:'multiselect',icon:'bi-list-check',name:'Multi-Select',sub:'multiple select'},
  {cat:'form',type:'checkbox',icon:'bi-check2-square',name:'Checkbox',sub:'<input checkbox>'},
  {cat:'form',type:'radio',icon:'bi-record-circle',name:'Radio',sub:'<input radio>'},
  {cat:'form',type:'range',icon:'bi-sliders',name:'Range',sub:'<input range>'},
  {cat:'form',type:'button',icon:'bi-hand-index',name:'Button',sub:'<button>'},
  {cat:'form',type:'button-group',icon:'bi-hand-index-fill',name:'Button Group',sub:'bs btn-group'},
  {cat:'form',type:'input-group',icon:'bi-input-cursor',name:'Input Group',sub:'bs input-group'},
  {cat:'form',type:'submit',icon:'bi-send',name:'Submit',sub:'submit button'},
  {cat:'form',type:'reset',icon:'bi-arrow-repeat',name:'Reset',sub:'reset button'},
  {cat:'form',type:'file',icon:'bi-file-earmark-arrow-up',name:'File Upload',sub:'file input'},
  {cat:'form',type:'color',icon:'bi-palette',name:'Color Picker',sub:'color input'},
  {cat:'form',type:'date',icon:'bi-calendar-date',name:'Date',sub:'date input'},
  {cat:'form',type:'datetime',icon:'bi-calendar2-event',name:'DateTime',sub:'datetime-local'},
  {cat:'form',type:'time',icon:'bi-clock',name:'Time Input',sub:'time picker'},
  {cat:'form',type:'week',icon:'bi-calendar-week',name:'Week',sub:'week picker'},
  {cat:'form',type:'month',icon:'bi-calendar3',name:'Month',sub:'month picker'},
  {cat:'form',type:'number',icon:'bi-123',name:'Number',sub:'number input'},
  {cat:'form',type:'tel',icon:'bi-telephone',name:'Phone',sub:'tel input'},
  {cat:'form',type:'email',icon:'bi-envelope',name:'Email',sub:'email input'},
  {cat:'form',type:'url',icon:'bi-link',name:'URL',sub:'url input'},
  {cat:'form',type:'password',icon:'bi-eye-slash',name:'Password',sub:'password input'},
  {cat:'form',type:'search',icon:'bi-search',name:'Search',sub:'search input'},
  {cat:'form',type:'hidden',icon:'bi-eye-slash-fill',name:'Hidden',sub:'hidden field'},
  {cat:'form',type:'switch',icon:'bi-toggle-on',name:'Switch',sub:'bs toggle switch'},
  {cat:'form',type:'datalist',icon:'bi-list-columns',name:'Datalist',sub:'autocomplete'},
  {cat:'form',type:'output',icon:'bi-box-arrow-right',name:'Output',sub:'<output>'},
  {cat:'form',type:'meter',icon:'bi-speedometer',name:'Meter',sub:'<meter>'},
  {cat:'form',type:'progress-el',icon:'bi-bar-chart-steps',name:'Progress El',sub:'<progress>'},
  // ── Media ───────────────────────────────────────────
  {cat:'media',group:'Media',type:'img',icon:'bi-image',name:'Image',sub:'<img>'},
  {cat:'media',type:'picture',icon:'bi-images',name:'Picture',sub:'<picture> responsive'},
  {cat:'media',type:'svg',icon:'bi-vector-pen',name:'SVG',sub:'inline svg'},
  {cat:'media',type:'canvas-el',icon:'bi-easel',name:'Canvas',sub:'<canvas>'},
  {cat:'media',type:'video',icon:'bi-camera-video',name:'Video',sub:'<video>'},
  {cat:'media',type:'audio',icon:'bi-music-note-beamed',name:'Audio',sub:'<audio>'},
  {cat:'media',type:'iframe',icon:'bi-box-arrow-in-right',name:'Iframe',sub:'embed'},
  {cat:'media',type:'figure',icon:'bi-image-alt',name:'Figure',sub:'fig+caption'},
  {cat:'media',type:'object-el',icon:'bi-box',name:'Object',sub:'<object> embed'},
  {cat:'media',type:'embed-el',icon:'bi-plug',name:'Embed',sub:'<embed>'},
  {cat:'media',type:'source',icon:'bi-file-play',name:'Source',sub:'<source>'},
  // ── Nav ─────────────────────────────────────────────
  {cat:'nav',group:'Navigation',type:'nav',icon:'bi-compass',name:'Nav',sub:'<nav>'},
  {cat:'nav',type:'navbar',icon:'bi-layout-text-sidebar-reverse',name:'Navbar',sub:'bs navbar'},
  {cat:'nav',type:'sidebar',icon:'bi-layout-sidebar-inset-reverse',name:'Sidebar',sub:'side nav'},
  {cat:'nav',type:'a',icon:'bi-link-45deg',name:'Link',sub:'<a> anchor'},
  {cat:'nav',type:'breadcrumb',icon:'bi-chevron-right',name:'Breadcrumb',sub:'bs breadcrumb'},
  {cat:'nav',type:'pagination',icon:'bi-three-dots',name:'Pagination',sub:'bs pagination'},
  {cat:'nav',type:'stepper',icon:'bi-arrow-right-circle',name:'Stepper',sub:'step indicator'},
  {cat:'nav',type:'menu',icon:'bi-list',name:'Menu List',sub:'nav menu'},
  // ── Bootstrap ───────────────────────────────────────
  {cat:'bs',group:'Bootstrap',type:'alert',icon:'bi-exclamation-triangle',name:'Alert',sub:'bs alert'},
  {cat:'bs',type:'badge',icon:'bi-award',name:'Badge',sub:'bs badge'},
  {cat:'bs',type:'progress',icon:'bi-bar-chart-steps',name:'Progress',sub:'bs progress bar'},
  {cat:'bs',type:'spinner',icon:'bi-arrow-repeat',name:'Spinner',sub:'bs loading'},
  {cat:'bs',type:'placeholder',icon:'bi-dash-square',name:'Placeholder',sub:'bs skeleton'},
  {cat:'bs',type:'toast',icon:'bi-bell',name:'Toast',sub:'bs notification'},
  {cat:'bs',type:'tooltip',icon:'bi-info-circle',name:'Tooltip',sub:'bs tooltip'},
  {cat:'bs',type:'popover',icon:'bi-chat-dots',name:'Popover',sub:'bs popover'},
  {cat:'bs',type:'dropdown',icon:'bi-caret-down-square',name:'Dropdown',sub:'bs dropdown'},
  {cat:'bs',type:'list-group',icon:'bi-list-stars',name:'List Group',sub:'bs list-group'},
  {cat:'bs',type:'table',icon:'bi-table',name:'Table',sub:'bs table'},
  {cat:'bs',type:'carousel',icon:'bi-images',name:'Carousel',sub:'bs image slider'},
  {cat:'bs',type:'collapse',icon:'bi-chevron-bar-down',name:'Collapse',sub:'bs collapse toggle'},
  {cat:'bs',type:'close-btn',icon:'bi-x-circle',name:'Close Btn',sub:'bs btn-close'},
  {cat:'bs',type:'divider-bs',icon:'bi-dash-lg',name:'Divider',sub:'bs hr separator'},
  // ── Data & JSON ─────────────────────────────────────
  {cat:'data',group:'Data & JSON',type:'loadJson',icon:'bi-file-earmark-code',name:'Load JSON',sub:'embed json file'},
  {cat:'data',type:'chart',icon:'bi-bar-chart',name:'Chart',sub:'data visualization'},
  {cat:'data',type:'template',icon:'bi-file-richtext',name:'Template',sub:'json template'},
  {cat:'data',type:'socket',icon:'bi-wifi',name:'WebSocket',sub:'live data stream'},
  {cat:'data',type:'repeater',icon:'bi-arrow-repeat',name:'Repeater',sub:'loop over items'},
  {cat:'data',type:'conditional',icon:'bi-question-diamond',name:'Conditional',sub:'show-if logic'},
  {cat:'data',type:'data-table',icon:'bi-grid-3x3',name:'Data Table',sub:'dynamic rows'},
  {cat:'data',type:'json-viewer',icon:'bi-braces',name:'JSON Viewer',sub:'display raw json'},
  // ── Action / IoT ────────────────────────────────────
  {cat:'action',group:'Actions (IoT)',type:'toggle',icon:'bi-toggle-on',name:'Toggle',sub:'on/off'},
  {cat:'action',type:'cmd',icon:'bi-terminal',name:'Command',sub:'send command'},
  {cat:'action',type:'rgb',icon:'bi-palette2',name:'RGB Picker',sub:'color action'},
  {cat:'action',type:'sensor',icon:'bi-thermometer-half',name:'Sensor',sub:'display value'},
  {cat:'action',type:'knob',icon:'bi-circle-half',name:'Knob',sub:'rotary control'},
  {cat:'action',type:'gauge',icon:'bi-speedometer2',name:'Gauge',sub:'meter display'},
  {cat:'action',type:'log-display',icon:'bi-journal-text',name:'Log Display',sub:'scrollable log'},
  {cat:'action',type:'notification-bell',icon:'bi-bell-fill',name:'Notif Bell',sub:'badge + icon'},
  // ── Feedback ────────────────────────────────────────
  {cat:'feedback',group:'Feedback / UX',type:'star-rating',icon:'bi-star',name:'Star Rating',sub:'1–5 stars'},
  {cat:'feedback',type:'like-btn',icon:'bi-hand-thumbs-up',name:'Like Button',sub:'thumb action'},
  {cat:'feedback',type:'copy-btn',icon:'bi-clipboard',name:'Copy Button',sub:'clipboard copy'},
  {cat:'feedback',type:'share-btn',icon:'bi-share',name:'Share Button',sub:'share action'},
  {cat:'feedback',type:'back-top',icon:'bi-chevron-up-circle',name:'Back to Top',sub:'scroll anchor'},
  {cat:'feedback',type:'loader',icon:'bi-hourglass-split',name:'Loader',sub:'full overlay'},
  {cat:'feedback',type:'empty-state',icon:'bi-inbox',name:'Empty State',sub:'no content placeholder'},
  {cat:'feedback',type:'error-state',icon:'bi-exclamation-octagon',name:'Error State',sub:'error block'},
  // ── Semantic / SEO ──────────────────────────────────
  {cat:'seo',group:'Semantic / SEO',type:'meta-block',icon:'bi-file-earmark-richtext',name:'Meta Block',sub:'SEO meta notes'},
  {cat:'seo',type:'schema-block',icon:'bi-braces-asterisk',name:'Schema Block',sub:'JSON-LD schema'},
  {cat:'seo',type:'canonical',icon:'bi-link-45deg',name:'Canonical',sub:'canonical url ref'},
  {cat:'seo',type:'og-block',icon:'bi-share-fill',name:'OG Tags',sub:'OpenGraph meta'},
];

/* ═══════════════════════════════════════════════════
   COMPONENT DEFAULTS
   ═══════════════════════════════════════════════════ */
const COMP_DEFAULTS = {
  /* ── Layout ── */
  div:            {tag:'div',title:'',id:'',class:'',style:'',attrs:'',children:true},
  container:      {tag:'div',title:'',id:'',class:'container',style:'',attrs:'',children:true},
  'container-fluid':{tag:'div',title:'',id:'',class:'container-fluid',style:'',attrs:'',children:true},
  row:            {tag:'div',title:'',id:'',class:'row',style:'',attrs:'',children:true},
  col:            {tag:'div',title:'Content',id:'',class:'col',style:'',attrs:'',children:true},
  flexbox:        {tag:'div',title:'',id:'',class:'d-flex gap-3 align-items-center',style:'',attrs:'',children:true},
  grid:           {tag:'div',title:'',id:'',class:'',style:'display:grid;grid-template-columns:repeat(3,1fr);gap:16px',attrs:'',children:true},
  section:        {tag:'section',title:'',id:'',class:'',style:'padding:48px 0',attrs:'',children:true},
  article:        {tag:'article',title:'',id:'',class:'',style:'',attrs:'',children:true},
  aside:          {tag:'aside',title:'',id:'',class:'',style:'',attrs:'',children:true},
  header:         {tag:'header',title:'',id:'',class:'',style:'',attrs:'',children:true},
  footer:         {tag:'footer',title:'',id:'',class:'',style:'',attrs:'',children:true},
  main:           {tag:'main',title:'',id:'',class:'',style:'',attrs:'',children:true},
  body:           {tag:'body',title:'Page Body',id:'',class:'',style:'',attrs:'',children:true},
  card:           {tag:'div',title:'Card Title',id:'',class:'card',style:'',body:'Card body text.',attrs:'',children:true},
  'card-header':  {tag:'div',title:'Header',id:'',class:'card-header',style:'',attrs:'',children:true},
  'card-body':    {tag:'div',title:'',id:'',class:'card-body',style:'',attrs:'',children:true},
  'card-footer':  {tag:'div',title:'Footer',id:'',class:'card-footer text-muted',style:'',attrs:'',children:true},
  accordion:      {tag:'div',title:'Item 1,Item 2,Item 3',id:'acc1',class:'accordion',style:'',attrs:'',children:false},
  modal:          {tag:'div',title:'Modal Title',id:'modal1',class:'modal fade',style:'',body:'Modal body content goes here.',attrs:'',children:false},
  offcanvas:      {tag:'div',title:'Offcanvas Title',id:'oc1',class:'offcanvas offcanvas-start',style:'',body:'Offcanvas content.',attrs:'',children:false},
  tabs:           {tag:'ul',title:'Tab 1,Tab 2,Tab 3',id:'',class:'nav nav-tabs',style:'',attrs:'',children:false},
  pills:          {tag:'ul',title:'Home,Profile,Settings',id:'',class:'nav nav-pills',style:'',attrs:'',children:false},
  jumbotron:      {tag:'div',title:'Hero Headline',id:'',class:'p-5 mb-3 bg-light rounded-3',style:'',body:'A short lead description that goes with the hero headline.',attrs:'',children:true},
  split:          {tag:'div',title:'',id:'',class:'row g-4',style:'',attrs:'',children:true},
  stack:          {tag:'div',title:'',id:'',class:'vstack gap-3',style:'',attrs:'',children:true},
  wrap:           {tag:'div',title:'',id:'',class:'d-flex flex-wrap gap-2',style:'',attrs:'',children:true},
  details:        {tag:'details',title:'Click to expand',id:'',class:'',style:'',body:'Hidden details content.',attrs:'',children:false},
  'layout-left-sidebar': {tag:'div',title:'',id:'',class:'container-fluid p-0',style:'',children:[{type:'navbar',class:'navbar navbar-expand-lg navbar-dark bg-dark px-3',children:[{type:'notification-bell'}]},{type:'row',class:'g-0 min-vh-100',children:[{type:'col',class:'col-md-2 bg-light border-end p-3',children:[{type:'sidebar',title:'Dashboard,Analytics,Settings'}]},{type:'col',class:'col-md-10 p-4',children:[{type:'h2',title:'Main Content'}]}]}]},
  'layout-right-sidebar': {tag:'div',title:'',id:'',class:'container-fluid p-0',style:'',children:[{type:'navbar',class:'navbar navbar-expand-lg navbar-dark bg-primary px-3'},{type:'row',class:'g-0 flex-row-reverse min-vh-100',children:[{type:'col',class:'col-md-3 bg-light border-start p-3',children:[{type:'sidebar',title:'Profile,Tasks'},{type:'toast'}]},{type:'col',class:'col-md-9 p-4',children:[{type:'h2',title:'Dashboard Content'},{type:'button',title:'Open Modal',attrs:'data-bs-toggle="modal" data-bs-target="#myModal"'}]}]}]},
  'layout-dashboard': {tag:'div',title:'',id:'',class:'container py-4',style:'',children:[{type:'row',class:'align-items-center mb-4',children:[{type:'col',class:'col-md-8',children:[{type:'h2',title:'IoT Control Panel'}]},{type:'col',class:'col-md-4 text-end',children:[{type:'notification-bell'}]}]},{type:'row',class:'g-4',children:[{type:'col',class:'col-md-4',children:[{type:'card',title:'Environment',children:[{type:'sensor',title:'Temp',state:'22°C'},{type:'sensor',title:'Humidity',state:'45%'}]}]},{type:'col',class:'col-md-4',children:[{type:'card',title:'Controls',children:[{type:'toggle',title:'Main Power'},{type:'knob',title:'Fan Speed'}]}]},{type:'col',class:'col-md-4',children:[{type:'card',title:'System Logs',children:[{type:'log-display'}]}]}]}]},
  /* ── Text ── */
  h1:{tag:'h1',title:'Heading 1',id:'',class:'',style:'',attrs:''},
  h2:{tag:'h2',title:'Heading 2',id:'',class:'',style:'',attrs:''},
  h3:{tag:'h3',title:'Heading 3',id:'',class:'',style:'',attrs:''},
  h4:{tag:'h4',title:'Heading 4',id:'',class:'',style:'',attrs:''},
  h5:{tag:'h5',title:'Heading 5',id:'',class:'',style:'',attrs:''},
  h6:{tag:'h6',title:'Heading 6',id:'',class:'',style:'',attrs:''},
  p: {tag:'p', title:'Paragraph text goes here.',id:'',class:'',style:'',attrs:''},
  span:{tag:'span',title:'Inline text',id:'',class:'',style:'',attrs:''},
  label:{tag:'label',title:'Label text',id:'',class:'form-label',style:'',for:'',attrs:''},
  blockquote:{tag:'blockquote',title:'Quote text here',id:'',class:'blockquote',style:'',attrs:''},
  code: {tag:'code',title:'code here',id:'',class:'',style:'',attrs:''},
  pre:  {tag:'pre', title:'// code block\nconsole.log("hello");',id:'',class:'',style:'',attrs:''},
  hr:   {tag:'hr', title:'',id:'',class:'',style:'',attrs:''},
  ul:   {tag:'ul', title:'',id:'',class:'list-group',style:'',attrs:'',children:true},
  ol:   {tag:'ol', title:'',id:'',class:'',style:'',attrs:'',children:true},
  li:   {tag:'li', title:'List item',id:'',class:'',style:'',attrs:''},
  strong:{tag:'strong',title:'Bold text',id:'',class:'',style:'',attrs:''},
  em:    {tag:'em',   title:'Italic text',id:'',class:'',style:'',attrs:''},
  small: {tag:'small',title:'Small text',id:'',class:'text-muted',style:'',attrs:''},
  mark:  {tag:'mark', title:'Highlighted text',id:'',class:'',style:'',attrs:''},
  abbr:  {tag:'abbr', title:'HTML',id:'',class:'',style:'',bs_title:'HyperText Markup Language',attrs:''},
  kbd:   {tag:'kbd',  title:'Ctrl+S',id:'',class:'',style:'',attrs:''},
  del:   {tag:'del',  title:'Removed text',id:'',class:'',style:'',attrs:''},
  sub:   {tag:'sub',  title:'2',id:'',class:'',style:'',attrs:''},
  sup:   {tag:'sup',  title:'2',id:'',class:'',style:'',attrs:''},
  time:  {tag:'time', title:'June 24, 2026',id:'',class:'',style:'',datetime:'2026-06-24',attrs:''},
  address:{tag:'address',title:'123 Main St, Springfield',id:'',class:'',style:'',attrs:''},
  cite:  {tag:'cite', title:'The Origin of Species',id:'',class:'',style:'',attrs:''},
  dfn:   {tag:'dfn',  title:'HTML',id:'',class:'',style:'',attrs:''},
  samp:  {tag:'samp', title:'Disk full.',id:'',class:'',style:'',attrs:''},
  var:   {tag:'var',  title:'x',id:'',class:'',style:'',attrs:''},
  bdi:   {tag:'bdi',  title:'user generated text',id:'',class:'',style:'',attrs:''},
  /* ── Form ── */
  form:    {tag:'form',title:'',id:'',class:'',style:'',action:'',method:'GET',attrs:'',children:true},
  fieldset:{tag:'fieldset',title:'',id:'',class:'border rounded p-3',style:'',attrs:'',children:true},
  legend:  {tag:'legend',title:'Section title',id:'',class:'',style:'',attrs:''},
  input:   {tag:'input',title:'Enter value',id:'inp1',name:'inp1',class:'form-control',style:'',type:'text',placeholder:'',value:'',action:'',attrs:''},
  textarea:{tag:'textarea',title:'',id:'ta1',name:'ta1',class:'form-control',style:'',rows:'3',placeholder:'',value:'',action:'',attrs:''},
  select:  {tag:'select',title:'',id:'sel1',name:'sel1',class:'form-select',style:'',options:'Option 1,Option 2,Option 3',action:'',attrs:''},
  multiselect:{tag:'select',title:'',id:'msel1',name:'msel1',class:'form-select',style:'',options:'Red,Green,Blue,Yellow',multiple:'true',attrs:''},
  checkbox:{tag:'input',title:'Enable this',id:'chk1',name:'chk1',class:'form-check-input',style:'',checked:'',action:'',attrs:''},
  radio:   {tag:'input',title:'Option A',id:'rad1',name:'radioGroup',class:'form-check-input',style:'',value:'A',action:'',attrs:''},
  range:   {tag:'input',title:'Brightness',id:'rng1',name:'rng1',class:'form-range',style:'',min:'0',max:'100',value:'50',step:'1',action:'',attrs:''},
  button:  {tag:'button',title:'Click Me',id:'',class:'btn btn-primary',style:'',type:'button',action:'',attrs:''},
  'button-group':{tag:'div',title:'Left,Middle,Right',id:'',class:'btn-group',style:'',role:'group',attrs:''},
  'input-group': {tag:'div',title:'@',id:'',class:'input-group',style:'',placeholder:'Username',attrs:''},
  submit:  {tag:'button',title:'Submit',id:'',class:'btn btn-success',style:'',type:'submit',action:'',attrs:''},
  reset:   {tag:'button',title:'Reset',id:'',class:'btn btn-secondary',style:'',type:'reset',action:'',attrs:''},
  file:    {tag:'input',title:'',id:'file1',name:'file1',class:'form-control',style:'',accept:'*',attrs:''},
  color:   {tag:'input',title:'Pick color',id:'col1',name:'col1',class:'form-control form-control-color',style:'',value:'#3b82f6',attrs:''},
  date:    {tag:'input',title:'',id:'dt1',name:'dt1',class:'form-control',style:'',value:'',attrs:''},
  datetime:{tag:'input',title:'',id:'dtl1',name:'dtl1',class:'form-control',style:'',type:'datetime-local',value:'',attrs:''},
  time:    {tag:'input',title:'',id:'tm1',name:'tm1',class:'form-control',style:'',type:'time',value:'',attrs:''},
  week:    {tag:'input',title:'',id:'wk1',name:'wk1',class:'form-control',style:'',type:'week',value:'',attrs:''},
  month:   {tag:'input',title:'',id:'mo1',name:'mo1',class:'form-control',style:'',type:'month',value:'',attrs:''},
  number:  {tag:'input',title:'',id:'num1',name:'num1',class:'form-control',style:'',min:'',max:'',step:'',value:'',attrs:''},
  tel:     {tag:'input',title:'',id:'tel1',name:'tel1',class:'form-control',style:'',type:'tel',placeholder:'+1 (555) 000-0000',attrs:''},
  email:   {tag:'input',title:'',id:'em1',name:'em1',class:'form-control',style:'',type:'email',placeholder:'you@example.com',attrs:''},
  url:     {tag:'input',title:'',id:'url1',name:'url1',class:'form-control',style:'',type:'url',placeholder:'https://example.com',attrs:''},
  password:{tag:'input',title:'',id:'pw1',name:'pw1',class:'form-control',style:'',type:'password',placeholder:'••••••••',attrs:''},
  search:  {tag:'input',title:'',id:'srch1',name:'srch1',class:'form-control',style:'',placeholder:'Search…',attrs:''},
  hidden:  {tag:'input',title:'',id:'hid1',name:'hid1',class:'',style:'',type:'hidden',value:'',attrs:''},
  switch:  {tag:'input',title:'Toggle',id:'sw1',name:'sw1',class:'form-check-input',style:'',role:'switch',checked:'',action:'',attrs:''},
  datalist:{tag:'input',title:'',id:'dl1',name:'dl1',class:'form-control',style:'',options:'Chrome,Firefox,Safari,Edge',attrs:''},
  output:  {tag:'output',title:'Result: 42',id:'out1',name:'out1',class:'',style:'',attrs:''},
  meter:   {tag:'meter',title:'',id:'mt1',class:'',style:'',value:'6',min:'0',max:'10',attrs:''},
  'progress-el':{tag:'progress',title:'',id:'pg1',class:'',style:'',value:'70',max:'100',attrs:''},
  /* ── Media ── */
  img:    {tag:'img',title:'',id:'',class:'img-fluid',style:'',src:'/img/photo.jpg',alt:'Image',attrs:''},
  picture:{tag:'picture',title:'',id:'',class:'',style:'',src:'/img/photo.jpg',alt:'Responsive image',attrs:''},
  svg:    {tag:'svg',title:'',id:'',class:'',style:'width:48px;height:48px',attrs:'viewBox="0 0 24 24" fill="currentColor"'},
  'canvas-el':{tag:'canvas',title:'',id:'cnv1',class:'border rounded',style:'width:100%;height:200px',attrs:''},
  video:  {tag:'video',title:'',id:'',class:'w-100',style:'',src:'',controls:'true',autoplay:'',attrs:''},
  audio:  {tag:'audio',title:'',id:'',class:'',style:'',src:'',controls:'true',attrs:''},
  iframe: {tag:'iframe',title:'',id:'',class:'w-100',style:'height:300px',src:'',attrs:''},
  figure: {tag:'figure',title:'',id:'',class:'figure',style:'',src:'/img/photo.jpg',caption:'Figure caption',attrs:''},
  'object-el':{tag:'object',title:'',id:'',class:'w-100',style:'height:300px',src:'/file.pdf',attrs:''},
  'embed-el': {tag:'embed',title:'',id:'',class:'w-100',style:'height:300px',src:'/file.pdf',attrs:''},
  source: {tag:'source',title:'',id:'',class:'',style:'',src:'',attrs:'type="video/mp4"'},
  /* ── Nav ── */
  nav:       {tag:'nav',title:'',id:'',class:'',style:'',attrs:'',children:true},
  navbar:    {tag:'nav',title:'Navbar Brand',id:'',class:'navbar navbar-expand-lg navbar-dark bg-dark',style:'',attrs:'',children:false},
  sidebar:   {tag:'nav',title:'Dashboard,Reports,Settings,Logout',id:'',class:'d-flex flex-column p-3 bg-light',style:'width:240px',attrs:'',children:false},
  a:         {tag:'a',title:'Link text',id:'',class:'',style:'',href:'#',target:'',attrs:''},
  breadcrumb:{tag:'nav',title:'Home,Section,Current',id:'',class:'',style:'',attrs:''},
  pagination:{tag:'nav',title:'Prev,1,2,3,Next',id:'',class:'',style:'',attrs:''},
  stepper:   {tag:'div',title:'Step 1,Step 2,Step 3',id:'',class:'d-flex gap-2',style:'',attrs:''},
  menu:      {tag:'ul',title:'Item 1,Item 2,Item 3',id:'',class:'list-unstyled',style:'',attrs:'',children:false},
  /* ── Bootstrap ── */
  alert:    {tag:'div',title:'Alert message here',id:'',class:'alert alert-primary',style:'',role:'alert',dismissible:'',attrs:''},
  badge:    {tag:'span',title:'New',id:'',class:'badge bg-primary',style:'',attrs:''},
  progress: {tag:'div',title:'',id:'',class:'progress',style:'',value:'75',attrs:''},
  spinner:  {tag:'div',title:'Loading...',id:'',class:'spinner-border text-primary',style:'',role:'status',attrs:''},
  placeholder:{tag:'div',title:'',id:'',class:'placeholder-glow',style:'',attrs:''},
  toast:    {tag:'div',title:'Toast Title\nBody text.',id:'',class:'toast show',style:'',attrs:''},
  tooltip:  {tag:'span',title:'Hover me',id:'',class:'',style:'',bs_toggle:'tooltip',bs_placement:'top',bs_title:'Tooltip text',attrs:''},
  popover:  {tag:'button',title:'Click for popover',id:'',class:'btn btn-secondary',style:'',bs_toggle:'popover',bs_placement:'top',bs_title:'Popover title',body:'Popover body content.',attrs:''},
  dropdown: {tag:'div',title:'Dropdown',id:'',class:'dropdown',style:'',options:'Action,Another,Divider,Something else',attrs:''},
  'list-group':{tag:'ul',title:'Item 1,Item 2,Item 3',id:'',class:'list-group',style:'',attrs:''},
  table:    {tag:'table',title:'Name,Age,Role',id:'',class:'table table-bordered',style:'',rows:'Alice,30,Admin\nBob,25,User',attrs:''},
  carousel: {tag:'div',title:'Slide 1,Slide 2,Slide 3',id:'car1',class:'carousel slide',style:'',attrs:''},
  collapse: {tag:'div',title:'Toggle content',id:'col1',class:'collapse',style:'',body:'Collapsible content here.',attrs:''},
  'close-btn':{tag:'button',title:'',id:'',class:'btn-close',style:'',attrs:'aria-label="Close"'},
  'divider-bs':{tag:'hr',title:'',id:'',class:'border-top border-2 opacity-25',style:'',attrs:''},
  /* ── Data & JSON ── */
  loadJson: {tag:'div',title:'',id:'',class:'',style:'',state:'section.json',refresh:'',action:'',attrs:'',children:true},
  chart:    {tag:'canvas',title:'Temperature',id:'ch1',class:'',style:'height:200px',state:'data.csv',attrs:''},
  template: {tag:'div',title:'',id:'',class:'',style:'',state:'template.json',attrs:''},
  socket:   {tag:'div',title:'',id:'',class:'',style:'',state:'ws://localhost:8080',response:'',attrs:''},
  repeater: {tag:'div',title:'',id:'',class:'',style:'',state:'items.json',attrs:'',children:true},
  conditional:{tag:'div',title:'',id:'',class:'',style:'',state:'flag==true',attrs:'',children:true},
  'data-table':{tag:'table',title:'Name,Email,Role',id:'',class:'table table-striped',style:'',state:'users.json',attrs:''},
  'json-viewer':{tag:'pre',title:'',id:'',class:'bg-dark text-light p-3 rounded',style:'',state:'data.json',attrs:''},
  /* ── Action / IoT ── */
  toggle:   {tag:'div',title:'Power',id:'tog1',class:'form-check form-switch fs-4',style:'',body:'<input class="form-check-input" type="checkbox" role="switch" id="tog1_inp" checked><label class="form-check-label ms-2" for="tog1_inp">Power</label>',state:'0',action:'/toggle',socket:'',response:'',attrs:''},
  cmd:      {tag:'button',title:'Run Command',id:'cmd1',class:'btn btn-primary d-inline-flex align-items-center gap-2 shadow-sm',style:'',body:'<i class="bi bi-terminal"></i> Run Command',action:'/cmd?command=on',socket:'',response:'',attrs:''},
  rgb:      {tag:'div',title:'RGB Picker',id:'rgb1',class:'card border-0 shadow-sm p-3 text-center',style:'width:120px;border-radius:12px',body:'<i class="bi bi-palette2 fs-1 text-primary"></i><div class="mt-2 fw-semibold">Color</div>',action:'/setcolor',response:'',attrs:''},
  sensor:   {tag:'div',title:'Temperature',id:'sen1',class:'card border-0 shadow-sm bg-gradient',style:'border-radius:12px;background:linear-gradient(135deg,#e0f2fe,#bae6fd)',body:'<div class="card-body d-flex align-items-center justify-content-between"><div class="fw-bold text-primary">Temperature</div><div class="fs-2 text-primary fw-bold">22°C</div></div>',state:'22°C',response:'temp',socket:'',attrs:''},
  knob:     {tag:'div',title:'Fan Speed',id:'knob1',class:'card border-0 shadow-sm text-center p-3',style:'width:150px;border-radius:12px',body:'<i class="bi bi-circle-half fs-1 text-info"></i><div class="mt-2 fs-3 fw-bold">50%</div><div class="text-muted small">Fan Speed</div>',state:'50',action:'/setspeed',min:'0',max:'100',attrs:''},
  gauge:    {tag:'div',title:'CPU Load',id:'gauge1',class:'card border-0 shadow-sm text-center p-3',style:'width:150px;border-radius:12px',body:'<i class="bi bi-speedometer2 fs-1 text-warning"></i><div class="mt-2 fs-3 fw-bold">42%</div><div class="text-muted small">CPU Load</div>',state:'42',min:'0',max:'100',response:'cpu',attrs:''},
  'log-display':{tag:'div',title:'System Logs',id:'log1',class:'bg-dark text-light font-monospace p-3 shadow-sm',style:'height:160px;overflow:auto;border-radius:8px',body:'<div class="text-success">[OK] System booted</div><div class="text-info">[INFO] Connecting...</div>',state:'logs.json',attrs:''},
  'notification-bell':{tag:'button',title:'Notifications',id:'bell1',class:'btn btn-light position-relative shadow-sm rounded-circle p-2',style:'width:48px;height:48px',body:'<i class="bi bi-bell-fill fs-4 text-secondary"></i><span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">3</span>',attrs:''},
  /* ── Feedback / UX ── */
  'star-rating':{tag:'div',title:'',id:'rate1',class:'',style:'',value:'4',max:'5',action:'/rate',attrs:''},
  'like-btn':{tag:'button',title:'Like',id:'',class:'btn btn-outline-primary btn-sm',style:'',action:'/like',attrs:''},
  'copy-btn':{tag:'button',title:'Copy',id:'',class:'btn btn-outline-secondary btn-sm',style:'',state:'',attrs:''},
  'share-btn':{tag:'button',title:'Share',id:'',class:'btn btn-outline-secondary btn-sm',style:'',action:'',attrs:''},
  'back-top':{tag:'button',title:'',id:'',class:'btn btn-primary rounded-circle',style:'',attrs:''},
  loader:   {tag:'div',title:'Loading…',id:'',class:'d-flex flex-column align-items-center gap-2 p-4',style:'',attrs:''},
  'empty-state':{tag:'div',title:'Nothing here yet',id:'',class:'text-center text-muted p-5',style:'',body:'Get started by adding your first item.',attrs:''},
  'error-state':{tag:'div',title:'Something went wrong',id:'',class:'text-center text-danger p-5',style:'',body:'Please try again, or contact support.',attrs:''},
  /* ── Semantic / SEO ── */
  'meta-block':{tag:'div',title:'SEO Notes',id:'',class:'small text-muted border rounded p-2',style:'',body:'Internal notes about page SEO (not rendered visually).',attrs:''},
  'schema-block':{tag:'script',title:'',id:'',class:'',style:'',state:'{"@context":"https://schema.org","@type":"WebPage"}',attrs:'type="application/ld+json"'},
  canonical: {tag:'link',title:'',id:'',class:'',style:'',href:'https://example.com/page',attrs:'rel="canonical"'},
  'og-block':{tag:'div',title:'OpenGraph Tags',id:'',class:'small text-muted border rounded p-2',style:'',state:'og:title, og:description, og:image',attrs:''},
};

const COMP_ICONS = {};
PALETTE.forEach(p=>COMP_ICONS[p.type]=p.icon);

const COMP_COLORS = {
  layout:'#818cf8',text:'#34d399',form:'#fbbf24',media:'#f472b6',
  nav:'#60a5fa',data:'#fb923c',action:'#a78bfa',bs:'#7dd3fc',
  feedback:'#f9a8d4',seo:'#86efac'
};

function getCompColor(type){
  const p=PALETTE.find(x=>x.type===type);
  return p?COMP_COLORS[p.cat]||'var(--muted)':'var(--muted)';
}

/* ═══════════════════════════════════════════════════
   PRESETS
   ═══════════════════════════════════════════════════ */
const PRESETS = {
  class:{
    div:['','container','container-fluid','row','col','d-flex','d-grid','d-none','position-relative'],
    button:['btn btn-primary','btn btn-secondary','btn btn-success','btn btn-danger','btn btn-warning','btn btn-outline-primary','btn btn-lg btn-primary','btn btn-sm btn-secondary','btn btn-dark','btn btn-link'],
    submit:['btn btn-success','btn btn-primary','btn btn-lg btn-success w-100'],
    reset:['btn btn-secondary','btn btn-outline-secondary'],
    input:['form-control','form-control form-control-sm','form-control form-control-lg','form-control is-valid','form-control is-invalid'],
    textarea:['form-control','form-control form-control-sm'],
    select:['form-select','form-select form-select-sm','form-select form-select-lg'],
    multiselect:['form-select','form-select form-select-sm'],
    alert:['alert alert-primary','alert alert-secondary','alert alert-success','alert alert-danger','alert alert-warning','alert alert-info','alert alert-light','alert alert-dark'],
    badge:['badge bg-primary','badge bg-secondary','badge bg-success','badge bg-danger','badge bg-warning text-dark','badge bg-info text-dark','badge rounded-pill bg-primary'],
    card:['card','card border-primary','card shadow','card shadow-lg','card text-white bg-dark','card h-100'],
    'card-header':['card-header','card-header bg-primary text-white','card-header bg-dark text-white'],
    'card-footer':['card-footer text-muted','card-footer text-end','card-footer bg-transparent'],
    table:['table','table table-striped','table table-bordered','table table-hover','table table-dark','table table-sm table-striped table-hover','table table-responsive'],
    'data-table':['table table-striped','table table-bordered table-hover'],
    img:['img-fluid','img-thumbnail','img-fluid rounded','img-fluid rounded-circle','img-fluid shadow'],
    p:['','text-muted','lead','text-center','text-end','text-danger','fw-bold','fst-italic'],
    h1:['display-1','display-2','fw-bold','text-primary','text-center'],
    h2:['display-3','fw-bold','text-secondary','border-bottom pb-2'],
    h3:['fw-bold','text-muted','border-bottom'],
    h4:['fw-bold','text-muted'],
    h5:['fw-semibold','text-muted'],
    h6:['text-uppercase text-muted small'],
    ul:['list-group','list-unstyled'],
    'list-group':['list-group','list-group list-group-flush','list-group list-group-horizontal','list-group list-group-numbered'],
    nav:['','nav nav-tabs','nav nav-pills','navbar-nav'],
    sidebar:['d-flex flex-column p-3 bg-light','d-flex flex-column p-3 bg-dark text-white'],
    form:['','row g-3','needs-validation'],
    fieldset:['border rounded p-3','border-0'],
    spinner:['spinner-border text-primary','spinner-border text-success','spinner-border text-danger','spinner-grow text-primary'],
    placeholder:['placeholder-glow','placeholder-wave'],
    col:['col','col-12','col-md-6','col-md-4','col-lg-3','col-sm-12 col-md-6 col-lg-4'],
    row:['row','row g-3','row g-4 align-items-center'],
    flexbox:['d-flex gap-3 align-items-center','d-flex justify-content-between','d-flex flex-column gap-2'],
    stack:['vstack gap-3','hstack gap-3'],
    wrap:['d-flex flex-wrap gap-2'],
    jumbotron:['p-5 mb-3 bg-light rounded-3','p-5 mb-3 bg-dark text-white rounded-3','p-5 bg-primary text-white'],
    section:['','bg-light','bg-dark text-white','py-5'],
    'button-group':['btn-group','btn-group-sm','btn-group-vertical'],
    'input-group':['input-group','input-group-sm','input-group-lg'],
    modal:['modal fade','modal fade modal-dialog-centered'],
    offcanvas:['offcanvas offcanvas-start','offcanvas offcanvas-end','offcanvas offcanvas-top','offcanvas offcanvas-bottom'],
    accordion:['accordion','accordion accordion-flush'],
    carousel:['carousel slide','carousel slide carousel-fade'],
    'star-rating':['text-warning','text-warning fs-4'],
    'like-btn':['btn btn-outline-primary btn-sm','btn btn-primary btn-sm'],
    'copy-btn':['btn btn-outline-secondary btn-sm'],
    'share-btn':['btn btn-outline-secondary btn-sm'],
    'back-top':['btn btn-primary rounded-circle','btn btn-dark rounded-circle'],
    'empty-state':['text-center text-muted p-5'],
    'error-state':['text-center text-danger p-5'],
  },
  title:{
    button:['Click Me','Submit','Learn More','Get Started','Cancel'],
    badge:['New','Beta','Sale','Pro','99+'],
    alert:['Alert message here','Success! Your changes were saved.','Warning: please check your input.','An error occurred. Please try again.'],
    h1:['Page Title','Welcome Back','Heading 1'],
  },
  style:{
    all:['','padding:16px','margin:8px 0','border:1px solid #dee2e6;padding:16px;border-radius:8px','background:#f8f9fa;padding:12px;border-radius:6px'],
    text:['','font-size:1.2rem','font-weight:bold','color:#6c757d','text-align:center'],
  },
  action:{all:['/action','/restart','/toggle','/set','/cmd?command=on','/cmd?command=off','/api/data','/like','/rate','/share']},
  href:['#','https://example.com','javascript:void(0)','/page','mailto:user@example.com'],
  target:['','_blank','_self','_parent'],
  type_input:['text','email','password','number','tel','url','hidden','date','datetime-local','month','week','time','color','range','file','checkbox','radio','search'],
  type_button:['button','submit','reset'],
  method:['GET','POST','PUT','DELETE','PATCH'],
};

/* ═══════════════════════════════════════════════════
   APP STATE
   ═══════════════════════════════════════════════════ */
const DB_NAME = 'uibuilder';
let blocks = [];
let pageTitle = 'New Page';
let pageFavicon = '';
let pageMockData = '{"title": "Hello World"}';
let selectedId = null;
let currentFile = null;
let idCounter = 1;
let undoStack = [];
let jsonPretty = true;
let fmFiles = [];
let fmSelectedFile = null;
let treeExpanded = {}; // cid -> bool
let treeVisible = true;

// Unique component id counter (cid) — stable, never reused
let cidCounter = 1;
function newCid(){ return 'cid_'+(cidCounter++).toString().padStart(4,'0'); }

function uid(){ return 'b'+(idCounter++)+'_'+Math.random().toString(36).slice(2,6); }

function makeBlock(type, parentCid=null){
  return inflateBlock({type: type}, parentCid);
}

/* ═══════════════════════════════════════════════════
   TREE PANEL TOGGLE
   ═══════════════════════════════════════════════════ */
function toggleTreePanel(){
  treeVisible = !treeVisible;
  // 'app' was renamed to 'shell' in the new layout; also tree lives in the tab system now
  const shell = document.getElementById('shell');
  if(shell) shell.classList.toggle('tree-hidden', !treeVisible);
  const btn = document.getElementById('tree-toggle-btn');
  if(btn) btn.classList.toggle('active-btn', treeVisible);
}

/* ═══════════════════════════════════════════════════
   PALETTE RENDER
   ═══════════════════════════════════════════════════ */
function renderPalette(){
  const pal = document.getElementById('palette');
  let html = '';
  let lastGroup = null;
  PALETTE.forEach(p=>{
    if(p.group && p.group !== lastGroup){
      html += `<div class="pal-group-label">${p.group}</div>`;
      lastGroup = p.group;
    }
    html += `<div class="pal-item" draggable="true" data-type="${p.type}" data-cat="${p.cat}">
      <i class="bi ${p.icon} icon"></i>
      <div class="info"><div class="name">${p.name}</div><div class="sub">${p.sub}</div></div>
      <span class="tag">&lt;${(COMP_DEFAULTS[p.type]||{}).tag||p.type}&gt;</span>
    </div>`;
  });
  pal.innerHTML = html;
  pal.querySelectorAll('.pal-item').forEach(el=>{
    el.addEventListener('dragstart',e=>{
      dragState.src = 'palette:'+el.dataset.type;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed='copy';
      e.dataTransfer.setData('text/plain', 'palette:'+el.dataset.type);
    });
    el.addEventListener('dragend',()=>el.classList.remove('dragging'));
    el.addEventListener('click',()=>addBlockAtEnd(el.dataset.type));
  });
}

/* ═══════════════════════════════════════════════════
   DRAG STATE
   ═══════════════════════════════════════════════════ */
const dragState = {src:null, blockId:null};

/* ═══════════════════════════════════════════════════
   BLOCK TREE HELPERS  (use _uid as internal key)
   ═══════════════════════════════════════════════════ */
function findBlock(uid, arr=blocks){
  for(const b of arr){
    if(b._uid===uid) return b;
    if(b.children?.length){
      const f=findBlock(uid,b.children);
      if(f) return f;
    }
  }
  return null;
}

function findByCid(cid, arr=blocks){
  for(const b of arr){
    if(b.cid===cid) return b;
    if(b.children?.length){
      const f=findByCid(cid,b.children);
      if(f) return f;
    }
  }
  return null;
}

function removeBlockFromTree(uid, arr=blocks){
  const i = arr.findIndex(b=>b._uid===uid);
  if(i!==-1){ arr.splice(i,1); return true; }
  for(const b of arr){
    if(b.children?.length && removeBlockFromTree(uid,b.children)) return true;
  }
  return false;
}

function getParentBlock(uid, arr=blocks, parent=null){
  for(const b of arr){
    if(b._uid===uid) return parent;
    if(b.children?.length){
      const p=getParentBlock(uid,b.children,b);
      if(p!==false) return p;
    }
  }
  return false;
}

function getAncestorPath(uid, arr=blocks, path=[]){
  for(const b of arr){
    if(b._uid===uid) return [...path, b];
    if(b.children?.length){
      const r=getAncestorPath(uid,b.children,[...path,b]);
      if(r) return r;
    }
  }
  return null;
}

function countAll(arr=blocks){
  let n=arr.length;
  arr.forEach(b=>{ if(b.children?.length) n+=countAll(b.children); });
  return n;
}

function cloneBlock(b){
  const c = JSON.parse(JSON.stringify(b));
  function reId(bl){
    bl._uid=uid();
    bl.cid=newCid();
    if(bl.children?.length) bl.children.forEach(reId);
  }
  reId(c);
  return c;
}

function addBlockAtEnd(type){ pushUndo(); blocks.push(makeBlock(type)); renderAll(); }

function insertBlockRelative(refUid, newBlock, above, arr=blocks, parent=null){
  for(let i=0;i<arr.length;i++){
    if(arr[i]._uid===refUid){
      newBlock.parentCid = parent ? parent.cid : null;
      arr.splice(above?i:i+1, 0, newBlock);
      return true;
    }
    if(arr[i].children?.length && insertBlockRelative(refUid,newBlock,above,arr[i].children,arr[i])) return true;
  }
  return false;
}

function isDescendant(targetUid, ancestor){
  if(!ancestor.children) return false;
  for(const c of ancestor.children){
    if(c._uid===targetUid||isDescendant(targetUid,c)) return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════
   RENDER ALL (canvas + tree)
   ═══════════════════════════════════════════════════ */
/* Post-render hooks — index.html registers callbacks here instead of patching renderAll */
const _afterRenderHooks = [];
function onAfterRender(fn){ _afterRenderHooks.push(fn); }

function renderAll(){
  renderCanvas();
  renderTree();
  _afterRenderHooks.forEach(fn=>{ try{ fn(); }catch(e){} });
}

/* ═══════════════════════════════════════════════════
   CANVAS RENDER
   ═══════════════════════════════════════════════════ */
function renderCanvas(){
  const canvas = document.getElementById('canvas');
  if(!canvas) return;

  // Remove only block/ch-empty children, keeping #canvas-empty in place
  Array.from(canvas.children).forEach(child=>{
    if(child.id !== 'canvas-empty') child.remove();
  });

  // Append fresh block elements for each top-level block
  blocks.forEach(b => canvas.appendChild(buildBlockEl(b)));

  // Show/hide the empty-state placeholder
  const emptyEl = document.getElementById('canvas-empty');
  if(emptyEl) emptyEl.style.display = blocks.length ? 'none' : '';

  const n = countAll();
  const ci = document.getElementById('canvas-info'); if(ci) ci.textContent = n+' component'+(n!==1?'s':'');
  const sb = document.getElementById('stat-blocks'); if(sb) sb.textContent = n+' block'+(n!==1?'s':'');
  const ub = document.getElementById('undo-btn'); if(ub) ub.disabled = undoStack.length===0;
  const jd = document.getElementById('json-drawer'); if(jd && jd.classList.contains('open')) renderJsonOutput();
}

function buildBlockEl(b, depth=0){
  const def = COMP_DEFAULTS[b.type]||{};
  const isContainer = def.children || (b.children && b.children.length>0);
  const color = getCompColor(b.type);
  const icon = COMP_ICONS[b.type]||'bi-square';
  const el = document.createElement('div');
  el.className = 'block'+(selectedId===b._uid?' selected':'');
  el.dataset.id = b._uid;
  el.draggable = true;

  // badges
  let badges = '';
  // CID badge — always shown
  badges += `<span class="bbadge cid" title="Component ID"><i class="bi bi-fingerprint"></i>${b.cid}</span>`;
  if(b.class) badges+=`<span class="bbadge cls"><i class="bi bi-tag-fill"></i>${b.class.split(' ').slice(0,2).join(' ')}</span>`;
  if(b.id)    badges+=`<span class="bbadge id"><i class="bi bi-hash"></i>${b.id}</span>`;
  if(b.action)badges+=`<span class="bbadge action"><i class="bi bi-arrow-right"></i>${b.action}</span>`;
  if(b.state) badges+=`<span class="bbadge bs"><i class="bi bi-file-code"></i>${b.state}</span>`;

  const label = b.title||b.src||b.href||b.value||b.state||'';
  // Comment display inside block
  const commentHtml = b.comment ? `<div class="block-comment"><i class="bi bi-chat-left-text"></i>${escHtml(b.comment)}</div>` : '';

  el.innerHTML=`
    <i class="bi bi-grip-vertical block-grip"></i>
    <i class="bi ${icon} block-icon" style="color:${color}"></i>
    <div class="block-body">
      <div class="block-type">${b.type} <span style="color:#555">&lt;${def.tag||b.type}&gt;</span></div>
      <div class="block-label">${label?'"'+escHtml(label.toString().slice(0,50))+'"':''}</div>
      <div class="block-badges">${badges}</div>
      ${commentHtml}
    </div>
    <div class="block-actions">
      <button class="ba-edit" title="Edit (${b.cid})" onclick="event.stopPropagation();selectBlock('${b._uid}')"><i class="bi bi-pencil"></i></button>
      <button class="ba-dup"  title="Duplicate" onclick="event.stopPropagation();duplicateBlock('${b._uid}')"><i class="bi bi-copy"></i></button>
      <button class="ba-del"  title="Remove" onclick="event.stopPropagation();deleteBlock('${b._uid}')"><i class="bi bi-x-lg"></i></button>
    </div>
    ${isContainer ? buildChildrenCanvasHTML(b,depth) : ''}
  `;

  el.addEventListener('dragstart',e=>{
    e.stopPropagation();
    dragState.src='block';dragState.blockId=b._uid;
    el.classList.add('dragging-block');
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain', 'block:'+b._uid);
  });
  el.addEventListener('dragend',()=>{ el.classList.remove('dragging-block','over-top','over-bottom'); });
  el.addEventListener('dragover',e=>{
    e.preventDefault();e.stopPropagation();
    // Set correct drop effect based on drag source
    e.dataTransfer.dropEffect = (dragState.src && dragState.src.startsWith('palette:')) ? 'copy' : 'move';
    const r=el.getBoundingClientRect();
    el.classList.remove('over-top','over-bottom');
    el.classList.add(e.clientY<r.top+r.height/2?'over-top':'over-bottom');
  });
  el.addEventListener('dragleave',e=>{
    if(!el.contains(e.relatedTarget)) el.classList.remove('over-top','over-bottom');
  });
  el.addEventListener('drop',e=>{
    e.preventDefault();e.stopPropagation();
    // Recover dragState from dataTransfer in case it was reset
    if(!dragState.src){
      const dt = e.dataTransfer.getData('text/plain');
      if(dt && dt.startsWith('palette:')) dragState.src = dt;
      else if(dt && dt.startsWith('block:')){ dragState.src='block'; dragState.blockId=dt.split(':')[1]; }
    }
    const above=el.classList.contains('over-top');
    el.classList.remove('over-top','over-bottom');
    handleBlockDrop(b._uid, above, null);
  });
  el.addEventListener('click',e=>{ e.stopPropagation(); selectBlock(b._uid); });

  if(isContainer){
    const cc = el.querySelector('.children-canvas');
    if(cc) wireChildrenCanvas(cc, b);
  }

  return el;
}

function escHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function buildChildrenCanvasHTML(b, depth){
  let inner = '';
  if(!b.children||!b.children.length){
    inner = '<div class="ch-empty">Drop inside this container</div>';
  } else {
    inner = '<div class="ch-empty" style="display:none"></div>';
  }
  return `<div class="children-canvas" data-parent="${b._uid}">${inner}</div>`;
}

function wireChildrenCanvas(cc, b){
  // Populate child blocks
  const placeholder = cc.querySelector('.ch-empty');
  if(b.children && b.children.length){
    if(placeholder) placeholder.style.display='none';
    b.children.forEach(child=>cc.appendChild(buildBlockEl(child, 1)));
  } else {
    if(placeholder) placeholder.style.display='';
  }
  // Wire drag events only once per element (cc is freshly created each renderCanvas)
  cc.addEventListener('dragover',e=>{ e.preventDefault();e.stopPropagation();cc.classList.add('over'); });
  cc.addEventListener('dragleave',e=>{ if(!cc.contains(e.relatedTarget)) cc.classList.remove('over'); });
  cc.addEventListener('drop',e=>{
    e.preventDefault();e.stopPropagation();
    cc.classList.remove('over');
    // Recover dragState from dataTransfer if needed
    if(!dragState.src){
      const dt = e.dataTransfer.getData('text/plain');
      if(dt && dt.startsWith('palette:')) dragState.src = dt;
      else if(dt && dt.startsWith('block:')){ dragState.src='block'; dragState.blockId=dt.split(':')[1]; }
    }
    handleBlockDrop(null, false, b._uid);
  });
}

function handleBlockDrop(refUid, above, parentUid){
  if(!dragState.src){ return; } // nothing being dragged, bail out silently
  pushUndo();
  if(dragState.src && dragState.src.startsWith('palette:')){
    const type = dragState.src.split(':')[1];
    const nb = makeBlock(type);
    if(parentUid && parentUid !== 'body-root'){
      const parent = findBlock(parentUid);
      if(parent){ parent.children = parent.children || []; parent.children.push(nb); nb.parentCid = parent.cid; }
    } else if(refUid){
      insertBlockRelative(refUid, nb, above);
    } else {
      nb.parentCid = null;
      blocks.push(nb);
    }
  } else if(dragState.src === 'block' && dragState.blockId){
    const moving = findBlock(dragState.blockId);
    if(!moving) return;
    if(parentUid && (parentUid === dragState.blockId || isDescendant(parentUid, moving))) return;
    removeBlockFromTree(dragState.blockId);
    if(parentUid){
      if(parentUid === 'body-root'){
        moving.parentCid = null;
        blocks.push(moving);
      } else {
        const parent = findBlock(parentUid);
        if(parent){ parent.children = parent.children || []; parent.children.push(moving); moving.parentCid = parent.cid; }
      }
    } else if(refUid){
      insertBlockRelative(refUid, moving, above);
    } else {
      moving.parentCid = null;
      blocks.push(moving);
    }
  }
  dragState.src = null; dragState.blockId = null;
  renderAll();
}

// Canvas root drop (builder only)
const _canvas = document.getElementById('canvas');
if(_canvas){
_canvas.addEventListener('dragover',e=>{
  e.preventDefault();
  _canvas.classList.add('over');
});
_canvas.addEventListener('dragleave',e=>{
  if(!_canvas.contains(e.relatedTarget))
    _canvas.classList.remove('over');
});
_canvas.addEventListener('drop',e=>{
  e.preventDefault();
  _canvas.classList.remove('over');
  // Recover dragState from dataTransfer if it was reset (e.g. cross-frame)
  if(!dragState.src){
    const dt = e.dataTransfer.getData('text/plain');
    if(dt && dt.startsWith('palette:')) dragState.src = dt;
    else if(dt && dt.startsWith('block:')){ dragState.src='block'; dragState.blockId=dt.split(':')[1]; }
  }
  if(!e.target.closest('.block')) handleBlockDrop(null,false,null);
});
}

/* ═══════════════════════════════════════════════════
   COMPONENT TREE PANEL
   ═══════════════════════════════════════════════════ */
let treeDragUid = null;
let treeDropTarget = null;

function renderTree(){
  const body = document.getElementById('tree-body');
  if(!body) return; // not in builder context
  const q = (document.getElementById('tree-search')?.value||'').toLowerCase().trim();
  body.innerHTML = '';

  const root = {
    _uid: 'body-root',
    cid: 'body',
    type: 'body',
    title: 'Page Body',
    comment: 'Root page container',
    children: blocks,
  };

  const rootNode = buildTreeNode(root, 0, q);
  if(!rootNode || (rootNode.nodeType === Node.TEXT_NODE && rootNode.textContent.trim() === '')){
    body.innerHTML='<div class="tree-empty"><i class="bi bi-diagram-3" style="font-size:24px;display:block;margin-bottom:6px"></i>No components found</div>';
    return;
  }
  body.appendChild(rootNode);
}

function blockMatchesSearch(b, q){
  if(!q) return true;
  return b.type.includes(q) || b.cid.includes(q) || (b.title||'').toLowerCase().includes(q)
    || (b.id||'').toLowerCase().includes(q) || (b.comment||'').toLowerCase().includes(q)
    || (b.class||'').toLowerCase().includes(q);
}

function subtreeMatches(b, q){
  if(blockMatchesSearch(b,q)) return true;
  return (b.children||[]).some(c=>subtreeMatches(c,q));
}

function buildTreeNode(b, depth, q=''){
  if(q && !subtreeMatches(b,q)) return document.createTextNode('');

  const def = COMP_DEFAULTS[b.type]||{};
  const isContainer = b._uid === 'body-root' || def.children || (b.children && b.children.length>0);
  const hasChildren = isContainer && b.children && b.children.length > 0;
  const isOpen = treeExpanded[b.cid] !== false; // default open
  const color = getCompColor(b.type);
  const icon = COMP_ICONS[b.type]||'bi-square';
  const label = b.title||b.id||b.src||b.href||'';
  const isSelected = selectedId === b._uid;

  const node = document.createElement('div');
  node.className = 'tree-node';
  node.dataset.uid = b._uid;
  node.dataset.cid = b.cid;

  const row = document.createElement('div');
  row.className = 'tree-row' + (isSelected ? ' selected' : '');
  row.dataset.uid = b._uid;
  row.title = `${b.type} • ${b.cid}${b.comment ? '\n💬 '+b.comment : ''}`;

  // Indent via padding based on depth
  row.style.paddingLeft = (8 + depth*14) + 'px';

  // Toggle
  const tog = document.createElement('span');
  tog.className = 'tree-toggle' + (hasChildren ? (isOpen ? ' open' : '') : ' leaf');
  tog.innerHTML = hasChildren ? '<i class="bi bi-chevron-right"></i>' : '';
  if(hasChildren){
    tog.addEventListener('click', e=>{
      e.stopPropagation();
      treeExpanded[b.cid] = !isOpen;
      renderTree();
    });
  }

  // Icon
  const ico = document.createElement('span');
  ico.className = 'tree-icon';
  ico.innerHTML = `<i class="bi ${icon}" style="color:${color}"></i>`;

  // Name
  const nm = document.createElement('span');
  nm.className = 'tree-name';
  const displayName = label ? `${b.type} <span style="color:#666;font-size:9px">"${escHtml(label.toString().slice(0,20))}"</span>` : b.type;
  nm.innerHTML = displayName;

  // CID label
  const cidLbl = document.createElement('span');
  cidLbl.className = 'tree-cid';
  cidLbl.textContent = b.cid;

  // Comment dot indicator
  let commentDot = '';
  if(b.comment){
    const dot = document.createElement('span');
    dot.className = 'tree-comment-dot';
    dot.title = 'Comment: '+b.comment;
    row.appendChild(dot);
  }

  // Actions
  const acts = document.createElement('span');
  acts.className = 'tree-actions';
  acts.innerHTML = `<button title="Delete" onclick="event.stopPropagation();deleteBlock('${b._uid}')"><i class="bi bi-x"></i></button>`;

  row.appendChild(tog);
  row.appendChild(ico);
  row.appendChild(nm);
  row.appendChild(cidLbl);
  if(b.comment){
    const dot = document.createElement('span');
    dot.className = 'tree-comment-dot';
    dot.title = '💬 '+b.comment;
    row.appendChild(dot);
  }
  row.appendChild(acts);

  // Click to select
  row.addEventListener('click', ()=>{
    selectBlock(b._uid);
    // scroll canvas block into view
    const el = document.querySelector(`.block[data-id="${b._uid}"]`);
    if(el){ el.scrollIntoView({behavior:'smooth',block:'nearest'}); el.classList.add('tree-highlight'); setTimeout(()=>el.classList.remove('tree-highlight'),1200); }
  });

  // Tree drag to reorder/reparent
  row.draggable = true;
  row.addEventListener('dragstart', e=>{
    e.stopPropagation();
    treeDragUid = b._uid;
    row.classList.add('drag-source');
    dragState.src = 'block';
    dragState.blockId = b._uid;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'block:'+b._uid);
  });
  row.addEventListener('dragend', ()=>{
    row.classList.remove('drag-source');
    document.querySelectorAll('.tree-row.tree-over').forEach(r=>r.classList.remove('tree-over'));
    treeDragUid = null;
  });
  row.addEventListener('dragover', e=>{
    e.preventDefault(); e.stopPropagation();
    document.querySelectorAll('.tree-row.tree-over').forEach(r=>r.classList.remove('tree-over'));
    row.classList.add('tree-over');
  });
  row.addEventListener('drop', e=>{
    e.preventDefault(); e.stopPropagation();
    row.classList.remove('tree-over');
    if(treeDragUid && treeDragUid !== b._uid){
      // drop INTO container, or beside leaf
      if(isContainer){
        handleBlockDrop(null, false, b._uid);
      } else {
        handleBlockDrop(b._uid, false, null);
      }
    }
    treeDragUid = null;
  });

  node.appendChild(row);

  // Children
  if(hasChildren && isOpen){
    const childWrap = document.createElement('div');
    childWrap.className = 'tree-children';
    b.children.forEach(c=>{
      const cn = buildTreeNode(c, depth+1, q);
      if(cn) childWrap.appendChild(cn);
    });
    node.appendChild(childWrap);
  }

  return node;
}

function expandAllTree(){
  function mark(arr){ arr.forEach(b=>{ treeExpanded[b.cid]=true; if(b.children?.length) mark(b.children); }); }
  mark(blocks);
  renderTree();
}

function collapseAllTree(){
  function mark(arr){ arr.forEach(b=>{ treeExpanded[b.cid]=false; if(b.children?.length) mark(b.children); }); }
  mark(blocks);
  renderTree();
}

/* ═══════════════════════════════════════════════════
   SELECT / EDIT
   ═══════════════════════════════════════════════════ */
function selectBlock(uid){
  selectedId = uid;
  renderCanvas();
  renderTree();
  // Auto-switch right panel to Props when selecting a block
  if(typeof setRightTab === 'function') setRightTab('editor');
  if(uid === 'body-root'){
    openBodyEditor();
  } else {
    openEditor(uid);
  }
}

function openBodyEditor(){
  document.getElementById('ep-placeholder').style.display='none';
  const content = document.getElementById('ep-content');
  content.style.display='flex';
  content.innerHTML = `
    <div class="ep-header">
      <i class="bi bi-layout-text-window ep-hicon"></i>
      <div class="ep-htitle">Page Body</div>
    </div>
    <div style="padding:0 14px 14px;color:var(--text2);font-size:12px;line-height:1.5;">
      <p>This is the root container of the page. All top-level components are children of the body.</p>
      <p>Drag components into the canvas or tree to add them under the body.</p>
    </div>`;
  document.addEventListener('click', closeAllPresets, {once:false});
}

function deleteBlock(uid){
  pushUndo();
  if(selectedId===uid){ selectedId=null; closeEditor(); }
  removeBlockFromTree(uid);
  renderAll();
}

function duplicateBlock(uid){
  pushUndo();
  const b = findBlock(uid);
  if(!b) return;
  const clone = cloneBlock(b);
  insertBlockRelative(uid, clone, false);
  renderAll();
}

function clearCanvas(){
  pushUndo();
  blocks=[];
  selectedId=null;
  closeEditor();
  renderAll();
}

/* ═══════════════════════════════════════════════════
   EDITOR PANEL
   ═══════════════════════════════════════════════════ */
function openEditor(uid){
  const b = findBlock(uid);
  if(!b) return;
  document.getElementById('ep-placeholder').style.display='none';
  const content = document.getElementById('ep-content');
  content.style.display='flex';
  content.innerHTML = buildEditorHTML(b);
  document.addEventListener('click', closeAllPresets, {once:false});
  renderPreview(b);
}

function closeEditor(){
  selectedId=null;
  document.getElementById('ep-placeholder').style.display='none';
  const content = document.getElementById('ep-content');
  content.style.display='flex';
  content.innerHTML = `
    <div class="ep-header">
      <i class="bi bi-file-earmark-richtext ep-hicon"></i>
      <div class="ep-htitle">Page Settings</div>
    </div>
    <div class="ep-section">Metadata</div>
    <div class="ep-field">
      <label>Page Title</label>
      <input type="text" class="ep-input" value="${escHtml(pageTitle)}" onchange="pageTitle=this.value;renderJsonOutput();">
    </div>
    <div class="ep-field">
      <label>Favicon URL</label>
      <input type="text" class="ep-input" placeholder="/favicon.ico" value="${escHtml(pageFavicon)}" onchange="pageFavicon=this.value;renderJsonOutput();">
    </div>
    <div class="ep-section" style="margin-top:16px;">Feather Mock Data</div>
    <div class="ep-field">
      <label>JSON Data for {{...}} replacements</label>
      <textarea class="ep-input" style="height:120px;font-family:monospace;font-size:11px" onchange="pageMockData=this.value;renderJsonOutput();">${escHtml(pageMockData)}</textarea>
    </div>
  `;
  renderCanvas();
  renderTree();
}

function updateProp(uid, key, val){
  const b = findBlock(uid);
  if(!b) return;
  b[key] = val;
  const el = document.querySelector(`.block[data-id="${uid}"]`);
  if(el){
    const lbl = el.querySelector('.block-label');
    const label = b.title||b.src||b.href||b.value||b.state||'';
    if(lbl) lbl.textContent = label?'"'+label.toString().slice(0,50)+'"':'';
    // refresh comment strip
    const existingComment = el.querySelector('.block-comment');
    if(existingComment) existingComment.remove();
    if(b.comment){
      const cd = document.createElement('div');
      cd.className='block-comment';
      cd.innerHTML=`<i class="bi bi-chat-left-text"></i>${escHtml(b.comment)}`;
      el.querySelector('.block-body').appendChild(cd);
    }
  }
  renderPreview(b);
  if(document.getElementById('json-drawer').classList.contains('open')) renderJsonOutput();
  // refresh tree to update comment dot
  if(key==='comment') renderTree();
}

function buildEditorHTML(b){
  const def = COMP_DEFAULTS[b.type]||{};
  const icon = COMP_ICONS[b.type]||'bi-square';
  const color = getCompColor(b.type);
  const allPre = PRESETS.class;

  // Build breadcrumb path
  const path = getAncestorPath(b._uid) || [b];
  const pathHtml = path.map((pb,i)=>{
    const isLast = i===path.length-1;
    return `<span class="ep-path-item${isLast?' current':''}" onclick="selectBlock('${pb._uid}')">
      <i class="bi ${COMP_ICONS[pb.type]||'bi-square'}" style="color:${getCompColor(pb.type)}"></i>${pb.type}
    </span>${!isLast?'<span class="ep-path-sep">›</span>':''}`;
  }).join('');

  function field(key,label,type='text',presets=[]){
    const val=(b[key]!==undefined?b[key]:'').toString().replace(/"/g,'&quot;').replace(/</g,'&lt;');
    const preHtml = presets.length ? `<div class="preset-wrap"><button class="preset-btn" onclick="togglePreset(event,'pre_${key}_${b._uid}')">presets ▾</button><div class="preset-menu" id="pre_${key}_${b._uid}">${presets.map(v=>`<div class="preset-item" onclick="applyPreset('${b._uid}','${key}','${v.replace(/'/g,"\\'")}','ep_${key}')">${v||'(empty)'}</div>`).join('')}</div></div>` : '';
    if(type==='textarea'){
      return `<div class="ep-field"><label><span>${label}</span>${preHtml}</label><textarea class="ep-textarea" id="ep_${key}" oninput="updateProp('${b._uid}','${key}',this.value)">${(b[key]||'').toString().replace(/</g,'&lt;')}</textarea></div>`;
    }
    return `<div class="ep-field"><label><span>${label}</span>${preHtml}</label><input class="ep-input" id="ep_${key}" type="${type}" value="${val}" oninput="updateProp('${b._uid}','${key}',this.value)"></div>`;
  }

  function checkField(key,label){
    return `<div class="ep-checkbox-row"><input type="checkbox" id="ep_${key}" ${b[key]?'checked':''} onchange="updateProp('${b._uid}','${key}',this.checked?'true':'')"><label for="ep_${key}">${label}</label></div>`;
  }

  function selectField(key,label,opts){
    const val=b[key]||'';
    return `<div class="ep-field"><label>${label}</label><select class="ep-select" id="ep_${key}" onchange="updateProp('${b._uid}','${key}',this.value)">
      ${opts.map(o=>`<option value="${o}" ${val===o?'selected':''}>${o||'—'}</option>`).join('')}
    </select></div>`;
  }

  function sliderField(key,label,min,max,step=1){
    const v=parseInt(b[key])||0;
    return `<div class="ep-field"><label><span>${label}</span><span class="ep-slider-val" id="sv_${key}">${v}</span></label>
      <div class="ep-slider-row"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}"
        oninput="document.getElementById('sv_${key}').textContent=this.value;updateProp('${b._uid}','${key}',this.value)"></div></div>`;
  }

  const t = b.type;

  let html = `
    <div class="ep-header">
      <i class="bi ${icon} ep-hicon" style="color:${color}"></i>
      <span class="ep-htitle">&lt;${def.tag||t}&gt; ${t}</span>
      <button class="ep-hclose" onclick="closeEditor()"><i class="bi bi-x-lg"></i></button>
    </div>
    <!-- Breadcrumb path -->
    <div class="ep-path">${pathHtml}</div>
    <!-- CID Box -->
    <div class="ep-cid-box">
      <i class="bi bi-fingerprint"></i>
      <span>Component ID: <strong>${b.cid}</strong></span>
      <span style="margin-left:auto;font-size:10px;color:#666">stable · exported</span>
    </div>
    <div class="ep-section">Dev Comment</div>
    <div class="ep-field ep-comment-field">
      <label><span>💬 Comment (visible in builder &amp; JSON)</span></label>
      <textarea class="ep-textarea" style="border-color:#3b2d5a;color:#c4b5fd;min-height:40px" 
        placeholder="Add a note about this component…"
        oninput="updateProp('${b._uid}','comment',this.value)">${escHtml(b.comment||'')}</textarea>
    </div>
    <div class="ep-section">Content</div>
  `;

  // Type-specific content fields
  if(['h1','h2','h3','h4','h5','h6','p','span','label','strong','em','small','mark','del','sub','sup','cite','dfn','samp','var','bdi','blockquote','li','a','button','submit','reset','badge','alert','sensor','cmd','toggle','legend','kbd','address','time','abbr','like-btn','copy-btn','share-btn','back-top','star-rating'].includes(t)){
    html += field('title','Text / Label', 'text', PRESETS.title?.[t]||[]);
  }
  if(['textarea','pre','code'].includes(t)){
    html += field('title','Content','textarea');
  }
  if(['loadJson','template','socket','chart','repeater','conditional','data-table','json-viewer','log-display'].includes(t)){
    html += field('state','Source File / URL','text',['section.json','data.json','ws://localhost:8080','items.json','logs.json']);
  }
  if(t==='img'||t==='picture'){ html += field('src','Image src','text'); html += field('alt','Alt text'); }
  if(t==='video'||t==='audio'){ html += field('src','Media src'); html += checkField('controls','Show controls'); html += checkField('autoplay','Autoplay'); }
  if(t==='iframe'){html += field('src','iFrame src');}
  if(t==='figure'){html += field('src','Image src'); html += field('caption','Caption');}
  if(t==='svg'){ html += field('attrs','SVG attrs (viewBox, fill…)','text'); }
  if(t==='canvas-el'){ html += field('id','Canvas element id'); }
  if(t==='object-el'||t==='embed-el'||t==='source'){ html += field('src','Embed src / URL'); }
  if(t==='a'){html += field('href','href','text',PRESETS.href); html += selectField('target','target',PRESETS.target);}
  if(t==='canonical'){ html += field('href','Canonical URL','text',PRESETS.href); }
  if(['input','search','tel','email','url','password','hidden','output'].includes(t)){
    html += field('placeholder','Placeholder');
    html += field('value','Value');
    if(t==='input') html += selectField('type','Input type',PRESETS.type_input);
  }
  if(['number'].includes(t)){ html += field('min','Min'); html += field('max','Max'); html += field('step','Step'); html += field('value','Value'); }
  if(t==='range'){ html += field('min','Min'); html += field('max','Max'); html += field('step','Step'); html += field('value','Value'); }
  if(t==='meter'||t==='progress-el'){ html += field('value','Value'); html += field('min','Min'); html += field('max','Max'); }
  if(['date','datetime','time','week','month'].includes(t)){ html += field('value','Default value'); }
  if(t==='textarea'){ html += field('rows','Rows','number'); html += field('placeholder','Placeholder'); }
  if(t==='select'||t==='multiselect'||t==='datalist'){ html += field('options','Options (comma separated)','text',['Option 1,Option 2,Option 3','Yes,No','Small,Medium,Large']); if(t==='multiselect') html += checkField('multiple','Allow multiple'); }
  if(t==='checkbox'||t==='radio'||t==='switch'||t==='toggle'){
    html += field('value','Value');
    html += checkField('checked','Checked by default');
  }
  if(t==='file'){ html += field('accept','Accepted file types','text',['*','image/*','.pdf,.doc,.docx','video/*']); }
  if(t==='form'){ html += field('action','Action URL'); html += selectField('method','Method',PRESETS.method); }
  if(t==='fieldset'||t==='legend'){ /* uses title above */ }
  if(t==='input-group'){ html += field('title','Prepend text (e.g. @, $)'); html += field('placeholder','Input placeholder'); }
  if(t==='button-group'){ html += field('title','Button labels (comma sep)'); }
  if(t==='table'||t==='data-table'){
    html += field('title','Headers (comma separated)','text',['Name,Age,Role','ID,Name,Status,Date']);
    if(t==='table') html += field('rows','Rows (comma within row, newline between rows)','textarea');
  }
  if(t==='progress'){ html += sliderField('value','Progress %',0,100); }
  if(t==='placeholder'){ html += selectField('size','Block size',['','xs','sm','lg']); }
  if(t==='alert'||t==='toast'){html += checkField('dismissible','Dismissible');}
  if(t==='breadcrumb'||t==='pagination'||t==='dropdown'||t==='list-group'||t==='tabs'||t==='pills'||t==='menu'||t==='stepper'||t==='carousel'||t==='accordion'){
    html += field('title','Items (comma separated)','text');
  }
  if(t==='navbar'||t==='sidebar'){html += field('title', t==='sidebar'?'Menu items (comma sep)':'Brand name');}
  if(t==='modal'||t==='offcanvas'){ html += field('title','Title'); html += field('body','Body text'); }
  if(t==='card'||t==='jumbotron'||t==='empty-state'||t==='error-state'){html += field('title','Title'); html += field('body','Body text');}
  if(t==='card-footer'||t==='card-header'){ /* title is the heading text, uses generic title field below via children patterns; leave as content */ }
  if(t==='details'){ html += field('title','Summary label'); html += field('body','Hidden content'); }
  if(t==='popover'){ html += field('bs_title','Popover title'); html += field('body','Popover body'); html += selectField('bs_placement','Placement',['top','bottom','left','right']); }
  if(t==='collapse'){ html += field('body','Collapsible content'); }
  if(t==='loadJson'){ html += field('refresh','Auto-refresh (ms)','text',['','1000','5000','30000']); }
  if(t==='tooltip'){ html += field('bs_title','Tooltip text'); html += selectField('bs_placement','Placement',['top','bottom','left','right']); }
  if(t==='knob'||t==='gauge'||t==='star-rating'){ html += field('value','Current value'); html += field('min','Min'); html += field('max','Max'); }
  if(t==='notification-bell'){ html += field('badge','Badge count','text',['','1','3','9+']); }
  if(['action','cmd','toggle','sensor','rgb','socket','template','knob','gauge','like-btn','share-btn','star-rating'].includes(t)||COMP_DEFAULTS[t]?.action!==undefined){
    html += field('action','Action / Endpoint','text',PRESETS.action?.all||[]);
  }
  if(COMP_DEFAULTS[t]?.socket!==undefined){ html += field('socket','Socket URL'); }
  if(COMP_DEFAULTS[t]?.response!==undefined){ html += field('response','Response JSON path'); }
  if(t==='schema-block'){ html += field('state','JSON-LD content','textarea'); }
  if(t==='og-block'||t==='meta-block'){ html += field('body','Notes','textarea'); }

  html += `<div class="ep-section">Styling (Bootstrap 5)</div>`;
  const colors = ['','primary','secondary','success','danger','warning','info','light','dark','white','transparent'];
  html += `<div class="ep-row2">`;
  html += selectField('bs_text_color','Text Color',colors);
  html += selectField('bs_bg_color','Bg Color',colors);
  html += `</div>`;
  if(t==='button'||t==='a'||t==='submit'||t==='cmd') html += selectField('bs_btn_variant','Btn Style',['','primary','secondary','success','danger','warning','info','light','dark','outline-primary','outline-secondary','link']);
  if(t==='alert') html += selectField('bs_alert_variant','Alert Color',['','primary','secondary','success','danger','warning','info','light','dark']);
  if(t==='badge') html += selectField('bs_badge_variant','Badge Color',['','primary','secondary','success','danger','warning','info','light','dark']);
  
  html += `<div class="ep-row2">`;
  html += selectField('bs_text_align','Text Align',['','start','center','end']);
  html += selectField('bs_rounded','Border Radius',['','rounded','rounded-0','rounded-1','rounded-2','rounded-3','rounded-circle','rounded-pill']);
  html += `</div>`;
  html += selectField('bs_shadow','Shadow',['','shadow-none','shadow-sm','shadow','shadow-lg']);

  const preC = allPre[t]||allPre['div']||[];
  html += field('class','Custom CSS class','text',preC.length?preC:PRESETS.class['div']||[]);
  html += field('style','Inline style','text',PRESETS.style.all);
  html += `<div class="ep-section">Identity</div>`;
  html += field('icon','Bootstrap Icon (e.g. bi-star)','text',['bi-star','bi-heart','bi-check-circle','bi-exclamation-triangle','bi-info-circle','bi-gear','bi-person','bi-bell']);
  html += `<div class="ep-row2">`;
  html += selectField('iconPosition','Icon Position',['left','right','top','bottom','center']);
  html += field('iconSize','Icon Size','text',['','16px','24px','32px','2rem','3rem']);
  html += `</div>`;
  html += field('iconColor','Icon Color','color');
  html += `<div class="ep-row2">${field('id','id')}${field('name','name')}</div>`;
  html += field('attrs','Extra HTML attrs','text',['data-bs-toggle="modal"','data-bs-target="#myModal"','role="button"']);
  html += `<div class="ep-section">Layout</div>`;
  html += `<div class="ep-row2">`;
  const spacings = ['','0','1','2','3','4','5','auto'];
  html += selectField('bs_margin','Margin (m-*)',spacings);
  html += selectField('bs_padding','Padding (p-*)',spacings);
  html += `</div>`;
  html += `<div class="ep-row2">`;
  html += `<div class="ep-field"><label>Width</label><input class="ep-input" value="${b.width||''}" oninput="updateProp('${b._uid}','width',this.value)" placeholder="auto/100%/200px"></div>`;
  html += `<div class="ep-field"><label>Height</label><input class="ep-input" value="${b.height||''}" oninput="updateProp('${b._uid}','height',this.value)" placeholder="auto"></div>`;
  html += `</div>`;
  html += `<div class="ep-row2">`;
  html += sliderField('_mt','Margin top',0,100);
  html += sliderField('_mb','Margin bottom',0,100);
  html += `</div>`;
  html += sliderField('_opacity','Opacity',0,100,1);

  // Parent/Children info section
  const parentB = getParentBlock(b._uid);
  html += `<div class="ep-section">Hierarchy</div>`;
  if(parentB && parentB !== null){
    html += `<div style="background:#0f1117;border:1px solid var(--panel-border);border-radius:6px;padding:8px;margin-bottom:8px;font-size:11px">
      <div style="color:var(--muted);margin-bottom:4px">Parent component</div>
      <div style="display:flex;align-items:center;gap:6px;cursor:pointer" onclick="selectBlock('${parentB._uid}')">
        <i class="bi ${COMP_ICONS[parentB.type]||'bi-square'}" style="color:${getCompColor(parentB.type)}"></i>
        <span style="color:var(--text2)">${parentB.type}</span>
        <span style="color:#555;font-size:10px;font-family:monospace">${parentB.cid}</span>
        <i class="bi bi-arrow-right-circle" style="color:var(--accent);margin-left:auto"></i>
      </div>
    </div>`;
  } else {
    html += `<div style="font-size:11px;color:#555;padding:4px 0 8px">Root level component</div>`;
  }
  if(b.children && b.children.length){
    html += `<div style="background:#0f1117;border:1px solid var(--panel-border);border-radius:6px;padding:8px;margin-bottom:8px;font-size:11px">
      <div style="color:var(--muted);margin-bottom:6px">Children (${b.children.length})</div>`;
    b.children.forEach(c=>{
      html += `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer;border-radius:4px" onclick="selectBlock('${c._uid}')" onmouseover="this.style.background='#21262d'" onmouseout="this.style.background=''">
        <i class="bi ${COMP_ICONS[c.type]||'bi-square'}" style="color:${getCompColor(c.type)};font-size:12px"></i>
        <span style="color:var(--text2)">${c.type}</span>
        <span style="color:#555;font-size:10px;font-family:monospace">${c.cid}</span>
        <i class="bi bi-arrow-right-circle" style="color:var(--accent);margin-left:auto;font-size:11px"></i>
      </div>`;
    });
    html += `</div>`;
  }

  html += `<div class="ep-preview"><div class="ep-preview-label">Live Preview</div><div class="ep-preview-area" id="ep-preview-area"></div></div>`;
  return html;
}

function buildClasses(b) {
  let c = b.class || '';
  if(b.bs_text_color) c += ' text-' + b.bs_text_color;
  if(b.bs_bg_color) c += ' bg-' + b.bs_bg_color;
  if(b.bs_text_align) c += ' text-' + b.bs_text_align;
  if(b.bs_margin) c += ' m-' + b.bs_margin;
  if(b.bs_padding) c += ' p-' + b.bs_padding;
  if(b.bs_rounded) c += ' ' + b.bs_rounded;
  if(b.bs_shadow) c += ' ' + b.bs_shadow;
  if(b.bs_btn_variant && (b.type==='button'||b.type==='a'||b.type==='submit'||b.type==='cmd')) c += ' btn btn-' + b.bs_btn_variant;
  if(b.bs_alert_variant && b.type==='alert') c += ' alert alert-' + b.bs_alert_variant;
  if(b.bs_badge_variant && b.type==='badge') c += ' badge bg-' + b.bs_badge_variant;
  return c.trim();
}

function renderPreview(b){
  const area = document.getElementById('ep-preview-area');
  if(!area) return;
  const style = buildInlineStyle(b);
  const cls = buildClasses(b);
  const t = b.type;
  
  let iconStyle = '';
  if(b.iconColor) iconStyle += `color:${b.iconColor};`;
  if(b.iconSize) iconStyle += `font-size:${b.iconSize};`;
  const iconPos = b.iconPosition || 'left';
  let iconClass = `bi ${b.icon||''}`;
  if(iconPos === 'left') iconClass += ' me-1';
  else if(iconPos === 'right') iconClass += ' ms-1';
  else if(iconPos === 'top') iconClass += ' d-block mb-1';
  else if(iconPos === 'bottom') iconClass += ' d-block mt-1';
  else if(iconPos === 'center') iconClass += ' d-block mx-auto mb-1 text-center';
  const iconHtml = b.icon ? `<i class="${iconClass}" ${iconStyle?`style="${iconStyle}"`:''}></i>` : '';
  
  const wrapIcon = (txt) => {
    if(!b.icon) return txt;
    if(iconPos === 'right' || iconPos === 'bottom') return txt + (iconPos==='right'?' ':'') + iconHtml;
    return iconHtml + (iconPos==='left'?' ':'') + txt;
  };
  
  let html = '';
  try{
    if(['h1','h2','h3','h4','h5','h6'].includes(t)) html=`<${t} class="${cls}" style="${style}">${wrapIcon(b.title||'Heading')}</${t}>`;
    else if(t==='p') html=`<p class="${cls}" style="${style}">${wrapIcon(b.title||'Text')}</p>`;
    else if(t==='span') html=`<span class="${cls}" style="${style}">${wrapIcon(b.title||'span')}</span>`;
    else if(t==='mark') html=`<mark class="${cls}" style="${style}">${wrapIcon(b.title||'Highlighted')}</mark>`;
    else if(t==='kbd') html=`<kbd class="${cls}" style="${style}">${wrapIcon(b.title||'Ctrl+S')}</kbd>`;
    else if(t==='del') html=`<del class="${cls}" style="${style}">${wrapIcon(b.title||'Removed text')}</del>`;
    else if(t==='sub'||t==='sup') html=`<span style="${style}">${wrapIcon('x<'+t+'>'+(b.title||'2')+'</'+t+'>')}</span>`;
    else if(t==='abbr') html=`<abbr class="${cls}" style="${style}" title="${b.bs_title||''}">${wrapIcon(b.title||'HTML')}</abbr>`;
    else if(t==='cite') html=`<cite class="${cls}" style="${style}">${wrapIcon(b.title||'Citation')}</cite>`;
    else if(t==='time') html=`<time class="${cls}" style="${style}">${wrapIcon(b.title||'Date')}</time>`;
    else if(t==='address') html=`<address class="${cls}" style="${style};font-size:12px">${wrapIcon(b.title||'Address')}</address>`;
    else if(t==='dfn'||t==='samp'||t==='var'||t==='bdi') html=`<${t} class="${cls}" style="${style}">${wrapIcon(b.title||t)}</${t}>`;
    else if(t==='toast') {
      const parts = (b.title||'Toast Title\nBody text.').split(/\r?\n|\\n/);
      const headerText = parts[0] || 'Toast Title';
      const bodyText = parts.slice(1).join('<br>') || 'Body text.';
      html = `
        <div class="toast show ${cls}" style="${style}; max-width: 250px;">
          <div class="toast-header">
            ${iconHtml}
            <strong class="me-auto">${headerText}</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
          </div>
          <div class="toast-body" style="font-size:12px">
            ${bodyText}
          </div>
        </div>
      `;
    }
    else if(t==='modal') {
      html=`<div class="${cls.replace(/modal|fade|modal-dialog-centered|modal-dialog/g, '')} border rounded shadow p-3 bg-white" style="${style}; max-width: 300px;">
        <div class="d-flex justify-content-between align-items-center mb-2 border-bottom pb-2">
          <strong>${wrapIcon(b.title||'Modal Window')}</strong><button type="button" class="btn-close" disabled></button>
        </div>
        <div style="font-size:12px">${b.body||'Modal body content goes here.'}</div>
      </div>`;
    }
    else if(t==='offcanvas') {
      html=`<div class="${cls.replace(/offcanvas|offcanvas-start|offcanvas-end|offcanvas-top|offcanvas-bottom/g, '')} border rounded shadow p-3 bg-light" style="${style}; max-width: 250px;">
        <div class="d-flex justify-content-between align-items-center mb-2 border-bottom pb-2">
          <strong>${wrapIcon(b.title||'Offcanvas')}</strong><button type="button" class="btn-close" disabled></button>
        </div>
        <div style="font-size:12px">${b.body||'Offcanvas content.'}</div>
      </div>`;
    }
    else if(t==='button'||t==='submit'||t==='reset'||t==='cmd'||t==='like-btn'||t==='share-btn'||t==='copy-btn'||t==='back-top') html=`<button class="${cls}" style="${style}" type="${t==='reset'?'reset':t==='submit'?'submit':'button'}">${wrapIcon(b.title||(t==='back-top'?'↑':'Button'))}</button>`;
    else if(['input','search','tel','email','url','password','hidden'].includes(t)) html=`<input class="${cls}" style="${style}" type="${t==='input'?(b.type||'text'):t}" placeholder="${b.placeholder||b.title||''}" value="${b.value||''}">`;
    else if(t==='number') html=`<input class="${cls}" style="${style}" type="number" min="${b.min||''}" max="${b.max||''}" value="${b.value||''}">`;
    else if(t==='date'||t==='datetime'||t==='time'||t==='week'||t==='month') html=`<input class="${cls}" style="${style}" type="${COMP_DEFAULTS[t]?.type||'date'}" value="${b.value||''}">`;
    else if(t==='color') html=`<input class="${cls}" style="${style}" type="color" value="${b.value||'#3b82f6'}">`;
    else if(t==='file') html=`<input class="${cls}" style="${style}" type="file">`;
    else if(t==='output') html=`<output class="${cls}" style="${style}">${b.title||'Output'}</output>`;
    else if(t==='meter') html=`<meter style="${style}" value="${b.value||6}" min="${b.min||0}" max="${b.max||10}"></meter>`;
    else if(t==='progress-el') html=`<progress style="${style}" value="${b.value||70}" max="${b.max||100}"></progress>`;
    else if(t==='textarea') html=`<textarea class="${cls}" style="${style};max-height:80px" rows="2" placeholder="${b.placeholder||''}">${b.value||''}</textarea>`;
    else if(t==='select'||t==='datalist') html=`<select class="${cls}" style="${style}">${(b.options||'').split(',').map(o=>`<option>${o.trim()}</option>`).join('')}</select>`;
    else if(t==='multiselect') html=`<select class="${cls}" style="${style}" multiple>${(b.options||'').split(',').map(o=>`<option>${o.trim()}</option>`).join('')}</select>`;
    else if(t==='checkbox'||t==='switch') html=`<div class="form-check form-switch"><input class="${cls}" type="checkbox" style="${style}" ${b.checked?'checked':''}><label class="form-check-label">${b.title||'Toggle'}</label></div>`;
    else if(t==='radio') html=`<div class="form-check"><input class="${cls}" type="radio" style="${style}" ${b.checked?'checked':''}><label class="form-check-label">${b.title||'Option A'}</label></div>`;
    else if(t==='range') html=`<div class="${cls}" style="${style}"><label style="font-size:12px;display:block">${b.title||'Range'}: <strong>${b.value||50}</strong></label><input type="range" class="form-range" min="${b.min||0}" max="${b.max||100}" value="${b.value||50}"></div>`;
    else if(t==='img'||t==='figure'||t==='picture') html=`<img class="${cls}" src="${b.src||''}" alt="${b.alt||b.title||'img'}" style="${style};max-height:80px;background:#eee;min-width:60px">`;
    else if(t==='svg') html=`<div style="width:32px;height:32px;border:1px dashed #aaa;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#888;font-size:10px">SVG</div>`;
    else if(t==='canvas-el') html=`<div style="${style};max-width:120px;max-height:60px;border:1px solid #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#999;font-size:10px">canvas</div>`;
    else if(t==='video'||t==='audio') html=`<div style="background:#222;color:#aaa;padding:8px;border-radius:6px;font-size:11px;display:flex;align-items:center;gap:6px"><i class="bi bi-${t==='video'?'camera-video':'music-note-beamed'}"></i> ${b.src||'media src'}</div>`;
    else if(t==='object-el'||t==='embed-el') html=`<div style="background:#222;color:#aaa;padding:8px;border-radius:6px;font-size:11px"><i class="bi bi-box"></i> ${b.src||'embed src'}</div>`;
    else if(t==='badge') html=`<span class="${cls}" style="${style}">${wrapIcon(b.title||'Badge')}</span>`;
    else if(t==='notification-bell') html=`<button class="${cls}" style="${style} position:relative">${iconHtml||'<i class="bi bi-bell-fill"></i>'}${b.badge?`<span class="badge bg-danger rounded-pill position-absolute top-0 start-100 translate-middle" style="font-size:9px">${b.badge}</span>`:''}</button>`;
    else if(t==='progress') {
      const val = b.value !== undefined ? b.value : 75;
      html = `<div class="progress ${cls}" style="${style}"><div class="progress-bar" role="progressbar" style="width:${val}%" aria-valuenow="${val}" aria-valuemin="0" aria-valuemax="100">${val}%</div></div>`;
    }
    else if(t==='placeholder') html=`<span class="placeholder col-6" style="${style}"></span>`;
    else if(t==='spinner') html=`<div class="${cls}" style="${style}" role="status"><span class="visually-hidden">Loading...</span></div>`;
    else if(t==='loader') html=`<div style="display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:#888"><div class="spinner-border spinner-border-sm"></div>${b.title||'Loading…'}</div>`;
    else if(t==='a') html=`<a href="${b.href||'#'}" class="${cls}" style="${style}">${wrapIcon(b.title||'Link')}</a>`;
    else if(t==='canonical') html=`<div style="font-size:11px;color:#888"><i class="bi bi-link-45deg"></i> rel=canonical → ${b.href||''}</div>`;
    else if(t==='card'||t==='jumbotron'||t==='empty-state'||t==='error-state') html=`<div class="${cls}" style="${style};max-width:220px"><div class="card-body"><h6 class="card-title" style="font-size:13px">${wrapIcon(b.title||'Title')}</h6><p class="card-text" style="font-size:11px">${b.body||'Body'}</p></div></div>`;
    else if(t==='card-header') html=`<div class="${cls}" style="${style};font-size:12px">${wrapIcon(b.title||'Header')}</div>`;
    else if(t==='card-footer') html=`<div class="${cls}" style="${style};font-size:11px">${wrapIcon(b.title||'Footer')}</div>`;
    else if(t==='table'||t==='data-table'){
      const hdrs=(b.title||'A,B').split(',');
      const rows=(b.rows||'').split('\n').filter(Boolean);
      html=`<table class="${cls}" style="${style};max-width:100%"><thead><tr>${hdrs.map(h=>`<th>${h.trim()}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.split(',').map(c=>`<td>${c.trim()}</td>`).join('')}</tr>`).join(''):`<tr>${hdrs.map(()=>'<td>…</td>').join('')}</tr>`}</tbody></table>`;
    }
    else if(t==='json-viewer') html=`<pre class="${cls}" style="${style};font-size:10px;max-height:80px;overflow:auto">${escHtml(b.state||'{}')}</pre>`;
    else if(t==='loadJson'||t==='template'||t==='repeater'||t==='conditional') html=`<div class="${cls}" style="${style};background:#e8f5e9;padding:8px;border-radius:6px;font-size:11px;color:#2e7d32"><i class="bi bi-file-earmark-code"></i> ${b.state||'?.json'}</div>`;
    else if(t==='socket') html=`<div style="background:#fff3e0;padding:8px;border-radius:6px;font-size:11px;color:#e65100"><i class="bi bi-wifi"></i> ${b.state||'ws://…'}</div>`;
    else if(['div','container','container-fluid','row','col','section','article','aside','header','footer','main','nav','form','ul','ol','flexbox','grid','split','stack','wrap','fieldset'].includes(t)) html=`<div class="${cls}" style="background:rgba(255,255,255,.04);border:1px dashed #555;border-radius:4px;padding:8px;font-size:11px;color:#888">&lt;${t}&gt; container</div>`;
    else if(t==='details') html=`<details style="font-size:12px"><summary>${b.title||'Click to expand'}</summary>${b.body||''}</details>`;
    else if(t==='legend') html=`<legend style="font-size:13px;border-bottom:1px solid #ccc;width:auto">${b.title||'Legend'}</legend>`;
    else if(t==='hr'||t==='divider-bs') html=`<hr class="${cls}" style="${style}">`;
    else if(t==='code') html=`<code class="${cls}" style="${style}">${b.title||'code'}</code>`;
    else if(t==='pre') html=`<pre class="${cls}" style="${style};max-height:80px;overflow:auto;font-size:11px">${b.title||''}</pre>`;
    else if(t==='list-group') html=`<ul class="${cls}" style="${style}">${(b.title||'Item 1,Item 2').split(',').map(i=>`<li class="list-group-item" style="font-size:12px">${i.trim()}</li>`).join('')}</ul>`;
    else if(t==='menu') html=`<ul class="${cls}" style="${style};font-size:12px">${(b.title||'Item 1,Item 2').split(',').map(i=>`<li>${i.trim()}</li>`).join('')}</ul>`;
    else if(t==='dropdown') html=`<div class="dropdown"><button class="btn btn-secondary dropdown-toggle btn-sm" type="button">${b.title||'Dropdown'}</button></div>`;
    else if(t==='navbar') html=`<nav class="navbar navbar-dark bg-dark" style="padding:4px 12px;border-radius:4px"><a class="navbar-brand" style="font-size:13px">${b.title||'Brand'}</a></nav>`;
    else if(t==='sidebar') html=`<div style="background:#f8f9fa;padding:8px;border-radius:4px;font-size:11px;max-width:140px">${(b.title||'Item 1,Item 2').split(',').map(i=>`<div style="padding:2px 0">${i.trim()}</div>`).join('')}</div>`;
    else if(t==='breadcrumb') html=`<nav><ol class="breadcrumb" style="font-size:12px;margin:0">${(b.title||'Home,Page').split(',').map((v,i,a)=>`<li class="breadcrumb-item${i===a.length-1?' active':''}">${i===a.length-1?v:`<a href="#">${v.trim()}</a>`}</li>`).join('')}</ol></nav>`;
    else if(t==='pagination') html=`<ul class="pagination" style="font-size:12px">${(b.title||'1,2,3').split(',').map(v=>`<li class="page-item"><a class="page-link">${v.trim()}</a></li>`).join('')}</ul>`;
    else if(t==='tabs'||t==='pills') html=`<ul class="nav ${t==='pills'?'nav-pills':'nav-tabs'}" style="font-size:12px">${(b.title||'Tab 1,Tab 2').split(',').map((v,i)=>`<li class="nav-item"><a class="nav-link${i===0?' active':''}">${v.trim()}</a></li>`).join('')}</ul>`;
    else if(t==='stepper') html=`<div style="display:flex;gap:6px;font-size:11px">${(b.title||'Step 1,Step 2').split(',').map((v,i)=>`<span class="badge ${i===0?'bg-primary':'bg-secondary'}">${v.trim()}</span>`).join('')}</div>`;
    else if(t==='accordion') html=`<div style="font-size:11px;border:1px solid #ccc;border-radius:4px;padding:6px">${(b.title||'Item 1').split(',').map(v=>`<div style="padding:2px 0">▸ ${v.trim()}</div>`).join('')}</div>`;
    else if(t==='carousel') html=`<div style="background:#222;color:#aaa;border-radius:6px;padding:14px;text-align:center;font-size:11px">${(b.title||'Slide 1').split(',')[0]}</div>`;
    else if(t==='collapse') html=`<div style="border:1px solid #ccc;border-radius:4px;padding:6px;font-size:11px">${b.body||'Collapsible content'}</div>`;
    else if(t==='modal'||t==='offcanvas') html=`<div style="border:1px solid #ccc;border-radius:6px;padding:8px;font-size:11px;max-width:200px"><strong>${b.title||'Title'}</strong><div style="margin-top:4px">${b.body||''}</div></div>`;
    else if(t==='tooltip') html=`<span style="${style};border-bottom:1px dotted #888;cursor:help">${b.title||'Hover me'}</span>`;
    else if(t==='popover') html=`<button class="${cls}" style="${style}">${b.title||'Click for popover'}</button>`;
    else if(t==='close-btn') html=`<button class="btn-close"></button>`;
    else if(t==='button-group') {
      const btnVar = b.bs_btn_variant ? 'btn-' + b.bs_btn_variant : 'btn-secondary';
      html = `<div class="${cls}" style="${style}" role="group">${(b.title||'').split(',').map(v=>`<button type="button" class="btn ${btnVar} btn-sm">${v.trim()}</button>`).join('')}</div>`;
    }
    else if(t==='input-group') {
      html = `<div class="input-group ${cls}" style="${style}"><span class="input-group-text">${b.title||''}</span><input class="form-control form-control-sm" placeholder="${b.placeholder||''}"></div>`;
    }
    else if(t==='chart') {
      html = `
        <div class="${cls}" style="${style};background:#1e1e2f;border-radius:8px;padding:12px;color:#fff;min-height:150px">
          <div style="font-size:12px;color:#888;margin-bottom:8px;display:flex;align-items:center">
            <i class="bi bi-bar-chart-line me-2"></i> ${b.title||'Chart'}
          </div>
          <div style="display:flex;align-items:flex-end;justify-content:space-around;height:100px;padding-top:10px">
            <div style="width:12%;height:40%;background:#3b82f6;border-radius:3px 3px 0 0"></div>
            <div style="width:12%;height:70%;background:#3b82f6;border-radius:3px 3px 0 0"></div>
            <div style="width:12%;height:55%;background:#3b82f6;border-radius:3px 3px 0 0"></div>
            <div style="width:12%;height:90%;background:#10b981;border-radius:3px 3px 0 0"></div>
            <div style="width:12%;height:35%;background:#3b82f6;border-radius:3px 3px 0 0"></div>
          </div>
        </div>
      `;
    }
    else if(t==='sensor') {
      const val = b.state || '—';
      const sensorIcon = b.icon ? `<i class="bi ${b.icon} fs-2 text-primary opacity-50"></i>` : `<i class="bi bi-thermometer-half fs-2 text-primary opacity-50"></i>`;
      html = `
        <div class="${cls}" style="${style}">
          <div class="card-body p-3 d-flex align-items-center justify-content-between">
            <div>
              <div class="text-muted small">${b.title||'Sensor'}</div>
              <div class="fs-4 fw-bold text-primary">${val}</div>
            </div>
            <div>${sensorIcon}</div>
          </div>
        </div>
      `;
    }
    else if(t==='toggle') {
      html = `<div class="form-check form-switch ${cls}" style="${style}"><input class="form-check-input" type="checkbox" ${b.state==='1'?'checked':''}><label class="form-check-label" style="font-size:12px">${b.title||'Toggle'}</label></div>`;
    }
    else if(t==='knob'||t==='gauge') {
      const val = parseInt(b.value || b.state) || 0;
      const min = parseInt(b.min) || 0;
      const max = parseInt(b.max) || 100;
      const pct = Math.max(0, Math.min(100, Math.round(((val - min) / (max - min)) * 100)));
      const icon = b.icon ? `<i class="bi ${b.icon} fs-4 mb-1 d-block text-primary"></i>` : (t==='knob' ? `<i class="bi bi-circle-half fs-4 mb-1 d-block text-info"></i>` : `<i class="bi bi-speedometer2 fs-4 mb-1 d-block text-warning"></i>`);
      html = `
        <div class="${cls}" style="${style}">
          <div class="card-body p-3 d-flex flex-column align-items-center">
            ${icon}
            <div class="position-relative d-flex align-items-center justify-content-center my-2" style="width: 70px; height: 70px;">
              <svg style="width:70px; height:70px; transform: rotate(-90deg)" viewBox="0 0 36 36">
                <path class="text-light" stroke-width="3" stroke="rgba(0,0,0,0.1)" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path stroke-width="3" stroke-dasharray="${pct}, 100" stroke-linecap="round" stroke="${t==='knob'?'#0dcaf0':'#ffc107'}" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div class="position-absolute fw-bold" style="font-size: 13px;">${val}${t==='knob'?'%':''}</div>
            </div>
            <div class="text-muted small fw-medium">${b.title||(t==='knob'?'Knob':'Gauge')}</div>
          </div>
        </div>
      `;
    }
    else if(t==='rgb') {
      const icon = b.icon ? `<i class="bi ${b.icon} fs-1 text-primary"></i>` : `<i class="bi bi-palette2 fs-1 text-primary"></i>`;
      html = `
        <div class="${cls}" style="${style}">
          <div class="card-body p-3 d-flex flex-column align-items-center">
            ${icon}
            <div class="mt-2 fw-semibold" style="font-size:12px">${b.title||'RGB Color'}</div>
            <input type="color" class="form-control form-control-color mt-2" style="width:100%;height:30px;padding:2px" value="${b.value||'#ff0000'}">
          </div>
        </div>
      `;
    }
    else if(t==='log-display') {
      html = `
        <div class="${cls}" style="${style};font-family:monospace;font-size:11px;overflow-y:auto;max-height:160px">
          <div style="color:#64e3ff;border-bottom:1px solid #333;padding-bottom:4px;margin-bottom:6px;font-size:10px;display:flex;align-items:center">
            <i class="bi bi-terminal me-2"></i> ${b.title||'System Logs'}
          </div>
          <div style="white-space:pre-wrap;color:#9be9a8">${b.body || '[INFO] Waiting for logs...'}</div>
        </div>
      `;
    }
    else if(t==='star-rating') {
      const val = parseInt(b.value) || 0;
      const max = parseInt(b.max) || 5;
      html = `<div class="${cls}" style="${style};color:#f59e0b;font-size:16px">${'★'.repeat(val)}${'☆'.repeat(Math.max(0, max - val))}</div>`;
    }
    else if(t==='meta-block'||t==='og-block') html=`<div class="${cls}" style="${style};font-size:11px"><i class="bi bi-file-earmark-richtext"></i> ${b.body||b.state||'SEO metadata'}</div>`;
    else if(t==='schema-block') html=`<pre style="font-size:10px;background:#111;color:#9be9a8;padding:6px;border-radius:4px;max-height:60px;overflow:auto">${escHtml(b.state||'{}')}</pre>`;
    else html=`<div class="${cls}" style="${style};border:1px dashed #555;padding:6px;font-size:11px;color:#888">[${t}]</div>`;

  }catch(e){ html=`<div style="color:red;font-size:11px">Preview error</div>`; }
  area.innerHTML=html;
}

function buildInlineStyle(b){
  let s = b.style||'';
  if(b.width&&b.width!=='auto') s+=';width:'+b.width;
  if(b.height&&b.height!=='auto') s+=';height:'+b.height;
  if(b._mt) s+=';margin-top:'+b._mt+'px';
  if(b._mb) s+=';margin-bottom:'+b._mb+'px';
  if(b._opacity!=null&&b._opacity!='100') s+=';opacity:'+(parseInt(b._opacity)/100);
  return s.replace(/^;/,'');
}

function togglePreset(e, menuId){
  e.stopPropagation();
  document.querySelectorAll('.preset-menu.open').forEach(m=>{ if(m.id!==menuId) m.classList.remove('open'); });
  document.getElementById(menuId)?.classList.toggle('open');
}
function closeAllPresets(){ document.querySelectorAll('.preset-menu.open').forEach(m=>m.classList.remove('open')); }
document.addEventListener('click', closeAllPresets);

function applyPreset(blockUid, key, val, inputId){
  updateProp(blockUid, key, val);
  const el = document.getElementById(inputId);
  if(el) el.value = val;
  document.querySelectorAll('.preset-menu.open').forEach(m=>m.classList.remove('open'));
}

/* ═══════════════════════════════════════════════════
   JSON OUTPUT — includes cid + comment
   ═══════════════════════════════════════════════════ */
function buildJson(){
  function serializeBlock(b){
    const skip=['_uid','parentCid','children','_mt','_mb','_opacity','width','height'];
    const out={ cid: b.cid, type: b.type };
    if(b.comment) out.comment = b.comment;
    for(const [k,v] of Object.entries(b)){
      if(skip.includes(k)) continue;
      if(k==='cid'||k==='type'||k==='comment') continue;
      if(v===''||v===undefined||v===null||v===false) continue;
      if(k.startsWith('_')) continue;
      out[k]=v;
    }
    let cs=buildInlineStyle(b);
    if(cs) out.style=cs; else delete out.style;
    if(b.children&&b.children.length) out.children=b.children.map(serializeBlock);
    return out;
  }
  return {
    meta: {
      title: pageTitle,
      favicon: pageFavicon,
      mockData: pageMockData
    },
    content: blocks.map(serializeBlock)
  };
}

function renderJsonOutput(){
  const out = buildJson();
  const str = jsonPretty ? JSON.stringify(out,null,2) : JSON.stringify(out);
  document.getElementById('json-output').textContent = str;
}

const _afterJsonDrawerHooks = [];
function onAfterJsonDrawer(fn){ _afterJsonDrawerHooks.push(fn); }

function toggleJsonDrawer(){
  const d = document.getElementById('json-drawer');
  if(!d) return;
  d.classList.toggle('open');
  if(d.classList.contains('open')) renderJsonOutput();
  _afterJsonDrawerHooks.forEach(fn=>{ try{ fn(); }catch(e){} });
}

function toggleJsonFormat(){
  jsonPretty=!jsonPretty;
  document.getElementById('json-fmt-btn').innerHTML=`<i class="bi bi-braces"></i> ${jsonPretty?'Pretty':'Compact'}`;
  renderJsonOutput();
}

function copyJson(){
  const str = JSON.stringify(buildJson(), null, jsonPretty?2:0);
  navigator.clipboard.writeText(str).then(()=>toast('JSON copied','success')).catch(()=>toast('Copy failed','error'));
}

function validateJson(){
  try{
    const j=JSON.stringify(buildJson());
    JSON.parse(j);
    toast('Valid JSON ✓','success');
  }catch(e){ toast('JSON error: '+e.message,'error'); }
}

/* ═══════════════════════════════════════════════════
   UNDO
   ═══════════════════════════════════════════════════ */
function pushUndo(){ undoStack.push(JSON.stringify({blocks, pageTitle, pageFavicon, pageMockData})); if(undoStack.length>30) undoStack.shift(); }
function undoLast(){
  if(!undoStack.length) return;
  const state = JSON.parse(undoStack.pop());
  blocks = state.blocks || [];
  pageTitle = state.pageTitle || '';
  pageFavicon = state.pageFavicon || '';
  pageMockData = state.pageMockData || '{}';
  // re-assign _uid (not stored) and restore cidCounter
  function restoreUids(arr){
    arr.forEach(b=>{
      if(!b._uid) b._uid = uid();
      if(b.children) restoreUids(b.children);
    });
  }
  restoreUids(blocks);
  renderAll();
  if(selectedId && !findBlock(selectedId)){ selectedId=null; closeEditor(); }
}

function getAllIds(arr){
  let ids=[0];
  arr.forEach(b=>{ ids.push(parseInt(b._uid?.replace(/[^\d]/g,'')||0)); if(b.children) ids.push(...getAllIds(b.children)); });
  return ids;
}

function getAllCids(arr){
  let ids=[0];
  arr.forEach(b=>{ const n=parseInt((b.cid||'').replace(/[^\d]/g,'')||0); ids.push(n); if(b.children) ids.push(...getAllCids(b.children)); });
  return ids;
}

/* ═══════════════════════════════════════════════════
   WEBDB SAVE/LOAD
   ═══════════════════════════════════════════════════ */
async function initDB(){
  try{
    await webdb.createDB(DB_NAME);
    await loadFileList();
    toast('DB ready: '+DB_NAME,'success');
  }catch(e){ toast('DB error: '+e.message,'error'); }
}

async function loadFileList(){
  try{
    const files = await webdb.list(DB_NAME);
    const jsonFiles = files.filter(f=>f.type==='file'&&f.name.endsWith('.json'));
    fmFiles = jsonFiles;
    const sel = document.getElementById('file-selector');
    const cur = sel.value;
    sel.innerHTML='<option value="">— new / unsaved —</option>';
    jsonFiles.sort((a,b)=>b.modified-a.modified).forEach(f=>{
      const opt=document.createElement('option');
      opt.value=f.name;
      opt.textContent=f.name+' ('+(f.size?Math.round(f.size/1024*10)/10+'KB':'0B')+')';
      if(f.name===cur) opt.selected=true;
      sel.appendChild(opt);
    });
  }catch(e){ console.warn('File list error:',e); }
}

function showSaveModal(){
  const fn = currentFile || '';
  document.getElementById('save-filename').value = fn.replace('.json','');
  document.getElementById('save-path-preview').textContent = fn||'filename.json';
  document.getElementById('save-filename').oninput=function(){
    document.getElementById('save-path-preview').textContent=(this.value||'filename')+'.json';
  };
  new bootstrap.Modal(document.getElementById('saveModal')).show();
}

async function saveToDb(){
  let name = document.getElementById('save-filename').value.trim();
  if(!name){ toast('Enter a filename','error'); return; }
  if(!name.endsWith('.json')) name+='.json';
  const content = buildJson();
  try{
    await webdb.upsert(`${DB_NAME}/${name}`, content);
    currentFile = name;
    document.getElementById('stat-file').textContent = name;
    document.getElementById('stat-saved').textContent = 'saved '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    bootstrap.Modal.getInstance(document.getElementById('saveModal'))?.hide();
    await loadFileList();
    document.getElementById('file-selector').value = name;
    toast('Saved: '+name,'success');
  }catch(e){ toast('Save error: '+e.message,'error'); }
}

async function loadSelectedFile(){
  const sel = document.getElementById('file-selector');
  if(!sel.value) return;
  await loadFile(sel.value);
}

async function loadFile(name){
  try{
    const rec = await webdb.read(`${DB_NAME}/${name}`);
    const data = rec.content;
    if(data&&data.content&&Array.isArray(data.content)){
      pushUndo();
      blocks = data.content.map(b=>inflateBlock(b));
      if(data.meta){
        pageTitle = data.meta.title || 'New Page';
        pageFavicon = data.meta.favicon || '';
        pageMockData = data.meta.mockData || '{}';
      } else {
        pageTitle = 'New Page';
        pageFavicon = '';
        pageMockData = '{}';
      }
      // restore counters
      idCounter = Math.max(idCounter, ...getAllIds(blocks))+1;
      cidCounter = Math.max(cidCounter, ...getAllCids(blocks))+1;
      currentFile = name;
      selectedId = null;
      closeEditor();
      renderAll();
      document.getElementById('stat-file').textContent = name;
      document.getElementById('stat-saved').textContent = 'loaded';
      document.getElementById('file-selector').value = name;
      toast('Loaded: '+name,'success');
    } else { toast('Invalid file format','error'); }
  }catch(e){ toast('Load error: '+e.message,'error'); }
}

function inflateBlock(raw, parentCid=null){
  const def = COMP_DEFAULTS[raw.type||'div'] || COMP_DEFAULTS.div;
  const b = {
    _uid: uid(),
    cid: raw.cid || newCid(),
    type: raw.type||'div',
    parentCid: parentCid,
    comment: '',
    children: [],
    ...(JSON.parse(JSON.stringify(def)))
  };
  Object.assign(b, raw);
  b._uid = uid(); // force fresh _uid
  if(parentCid) b.parentCid = parentCid; // override with explicit parentCid
  
  if(raw.children && Array.isArray(raw.children)){
    b.children = raw.children.map(c=>inflateBlock(c, b.cid));
  } else if(b.children === true) {
    b.children = [];
  } else if(b.children && Array.isArray(b.children)){
    b.children = b.children.map(c=>inflateBlock(c, b.cid));
  } else {
    b.children = [];
  }
  return b;
}

function showFileManager(){
  renderFileManager();
  new bootstrap.Modal(document.getElementById('fmModal')).show();
}

function renderFileManager(){
  const q = (document.getElementById('fm-search')?.value||'').toLowerCase();
  const list = document.getElementById('fm-list');
  const files = fmFiles.filter(f=>!q||f.name.toLowerCase().includes(q));
  document.getElementById('fm-count').textContent = files.length+' file'+(files.length!==1?'s':'');
  if(!files.length){ list.innerHTML='<div id="fm-empty"><i class="bi bi-folder2" style="font-size:32px;display:block;margin-bottom:8px"></i>No JSON files saved yet</div>'; return; }
  list.innerHTML = files.sort((a,b)=>b.modified-a.modified).map(f=>`
    <div class="file-item json-file ${fmSelectedFile===f.name?'active':''}" onclick="selectFmFile('${f.name}')">
      <i class="bi bi-file-earmark-code"></i>
      <span class="fname">${f.name}</span>
      <span class="fmeta">${f.size?Math.round(f.size/1024*10)/10+'KB':'0B'} · ${f.modified?new Date(f.modified).toLocaleDateString():''}</span>
      <button class="fdel" onclick="event.stopPropagation();deleteFmFile('${f.name}')"><i class="bi bi-trash"></i></button>
    </div>
  `).join('');
}

function selectFmFile(name){
  fmSelectedFile = name;
  renderFileManager();
  document.getElementById('fm-load-btn').disabled = false;
}

async function loadFromFileManager(){
  if(!fmSelectedFile) return;
  bootstrap.Modal.getInstance(document.getElementById('fmModal'))?.hide();
  await loadFile(fmSelectedFile);
}

async function deleteFmFile(name){
  if(!confirm(`Delete "${name}"?`)) return;
  try{
    await webdb.delete(`${DB_NAME}/${name}`);
    if(currentFile===name){ currentFile=null; document.getElementById('stat-file').textContent='unsaved'; document.getElementById('file-selector').value=''; }
    if(fmSelectedFile===name){ fmSelectedFile=null; document.getElementById('fm-load-btn').disabled=true; }
    await loadFileList();
    renderFileManager();
    toast('Deleted: '+name);
  }catch(e){ toast('Delete error: '+e.message,'error'); }
}

async function deleteCurrentFile(){
  if(!fmSelectedFile){ toast('Select a file first','error'); return; }
  await deleteFmFile(fmSelectedFile);
}

/* ═══════════════════════════════════════════════════
   PREVIEW
   ═══════════════════════════════════════════════════ */
// Alias so index.html inline scripts can call either name
function buildPreviewHtml(){ const j=buildJson(); return generatePreviewHTML(j.content||[], j.meta||{}); }
function previewPage(){
  const json = buildJson();
  const html = generatePreviewHTML(json.content||[], json.meta||{});
  const iframe = document.getElementById('preview-iframe');
  iframe.srcdoc = html;
  new bootstrap.Modal(document.getElementById('previewModal')).show();
}

function generatePreviewHTML(content, meta){
  meta = meta || (typeof buildJson==='function' ? (buildJson().meta||{}) : {}) || {};
  function renderEl(b){
    const def = COMP_DEFAULTS[b.type]||{};
    const tag = def.tag||b.type||'div';
    const style = buildInlineStyle(b);
    const cls = buildClasses(b);
    const id = b.id?`id="${b.id}"`:'';
    const extraAttrs = b.attrs||'';
    const children = b.children&&b.children.length ? b.children.map(renderEl).join('') : (b.body||'');
    
    let iconStyle = '';
    if(b.iconColor) iconStyle += `color:${b.iconColor};`;
    if(b.iconSize) iconStyle += `font-size:${b.iconSize};`;
    const iconPos = b.iconPosition || 'left';
    let iconClass = `bi ${b.icon||''}`;
    if(iconPos === 'left') iconClass += ' me-1';
    else if(iconPos === 'right') iconClass += ' ms-1';
    else if(iconPos === 'top') iconClass += ' d-block mb-1';
    else if(iconPos === 'bottom') iconClass += ' d-block mt-1';
    else if(iconPos === 'center') iconClass += ' d-block mx-auto mb-1 text-center';
    const iconHtml = b.icon ? `<i class="${iconClass}" ${iconStyle?`style="${iconStyle}"`:''}></i>` : '';
    
    const wrapIcon = (txt) => {
      if(!b.icon) return txt;
      if(iconPos === 'right' || iconPos === 'bottom') return txt + (iconPos==='right'?' ':'') + iconHtml;
      return iconHtml + (iconPos==='left'?' ':'') + txt;
    };
    if(tag==='hr'||tag==='input'||tag==='img'||tag==='br'||tag==='meter'||tag==='progress'||tag==='source'||tag==='link'||tag==='embed'){
      if(tag==='input'){
        const t = b.type;
        if(t==='checkbox'||t==='switch') return `<div class="form-check form-switch ${cls}" style="${style}" data-cid="${b.cid}"><input ${id} class="form-check-input" type="checkbox" ${b.checked?'checked':''} ${extraAttrs}><label class="form-check-label">${b.title||'Toggle'}</label></div>`;
        if(t==='radio') return `<div class="form-check ${cls}" style="${style}" data-cid="${b.cid}"><input ${id} class="form-check-input" type="radio" ${b.checked?'checked':''} ${extraAttrs}><label class="form-check-label">${b.title||'Option'}</label></div>`;
        if(t==='range') return `<div class="${cls}" style="${style}" data-cid="${b.cid}"><label class="form-label">${b.title||'Range'}: ${b.value||50}</label><input ${id} type="range" class="form-range" min="${b.min||0}" max="${b.max||100}" step="${b.step||1}" value="${b.value||50}" ${extraAttrs}></div>`;
        
        const typeAttr = b.type==='input'?(b.attrs&&b.attrs.includes('type=')?'':(b.type||'text')):(COMP_DEFAULTS[b.type]?.type||'text');
        return `<input ${id} class="${cls}" type="${typeAttr}" style="${style}" placeholder="${b.placeholder||''}" value="${b.value||''}" min="${b.min||''}" max="${b.max||''}" step="${b.step||''}" ${b.checked?'checked':''} ${extraAttrs} data-cid="${b.cid}">`;
      }
      if(tag==='img') return `<img ${id} class="${cls}" src="${b.src||''}" alt="${b.alt||''}" style="${style}" ${extraAttrs} data-cid="${b.cid}">`;
      if(tag==='meter') return `<meter ${id} class="${cls}" style="${style}" value="${b.value||0}" min="${b.min||0}" max="${b.max||100}" ${extraAttrs} data-cid="${b.cid}"></meter>`;
      if(tag==='progress') return `<progress ${id} class="${cls}" style="${style}" value="${b.value||0}" max="${b.max||100}" ${extraAttrs} data-cid="${b.cid}"></progress>`;
      if(tag==='link') return `<link ${id} ${extraAttrs} href="${b.href||''}" data-cid="${b.cid}">`;
      if(tag==='source') return `<source ${id} src="${b.src||''}" ${extraAttrs} data-cid="${b.cid}">`;
      if(tag==='embed') return `<embed ${id} class="${cls}" src="${b.src||''}" style="${style}" ${extraAttrs} data-cid="${b.cid}">`;
      return `<${tag} ${id} class="${cls}" style="${style}" ${extraAttrs} data-cid="${b.cid}">`;
    }
    const innerText = b.title||b.value||'';
    let inner='';
    const t=b.type;
    if(t==='card'||t==='jumbotron') inner=`<div class="${t==='card'?'card-body':''}"><h5 class="${t==='card'?'card-title':''}">${wrapIcon(b.title||'Title')}</h5><p class="${t==='card'?'card-text':'lead'}">${b.body||''}</p>${children}</div>`;
    else if(t==='card-header'||t==='card-footer') inner = wrapIcon(innerText || children);
    else if(t==='card-body') inner = children;
    else if(t==='empty-state'||t==='error-state') inner=`<h5>${wrapIcon(b.title||'')}</h5><p>${b.body||''}</p>`;
    else if(t==='table'||t==='data-table'){
      const hdrs=(b.title||'').split(',');
      const rows=(b.rows||'').split('\n').filter(Boolean);
      inner=`<thead><tr>${hdrs.map(h=>`<th>${h.trim()}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.split(',').map(c=>`<td>${c.trim()}</td>`).join('')}</tr>`).join('')}</tbody>`;
    }
    else if(t==='select'||t==='datalist') inner=(b.options||'').split(',').map(o=>`<option>${o.trim()}</option>`).join('');
    else if(t==='multiselect') inner=(b.options||'').split(',').map(o=>`<option>${o.trim()}</option>`).join('');
    else if(t==='progress') {
      const val = b.value !== undefined ? b.value : 75;
      inner = `<div class="progress-bar" role="progressbar" style="width:${val}%" aria-valuenow="${val}" aria-valuemin="0" aria-valuemax="100">${val}%</div>`;
    }
    else if(t==='spinner') inner=`<span class="visually-hidden">${b.title||'Loading...'}</span>`;
    else if(t==='placeholder') inner=`<span class="placeholder col-6"></span>`;
    else if(t==='loader') inner=`<div class="spinner-border spinner-border-sm me-2"></div>${b.title||'Loading…'}`;
    else if(t==='alert') {
      inner = wrapIcon(innerText.replace(/\n/g,'<br>')) + (b.dismissible ? '<button type="button" class="btn-close float-end" data-bs-dismiss="alert"></button>' : '');
    }
    else if(t==='toast') {
      const parts = (b.title||'Toast Title\nBody text.').split(/\r?\n|\\n/);
      const headerText = parts[0] || 'Toast Title';
      const bodyText = parts.slice(1).join('<br>') || 'Body text.';
      inner = `
        <div class="toast-header">
          ${iconHtml}
          <strong class="me-auto">${headerText}</strong>
          <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body">
          ${bodyText}
        </div>
      `;
    }
    else if(t==='list-group'||t==='menu') inner=(b.title||'').split(',').map(v=>`<li class="${t==='list-group'?'list-group-item':''}">${wrapIcon(v.trim())}</li>`).join('');
    else if(t==='dropdown') inner=`<button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">${wrapIcon(b.title||'Dropdown')}</button><ul class="dropdown-menu">${(b.options||'').split(',').map(o=>o.trim()==='Divider'?'<li><hr class="dropdown-divider"></li>':`<li><a class="dropdown-item" href="#">${wrapIcon(o.trim())}</a></li>`).join('')}</ul>`;
    else if(t==='navbar') inner=`<a class="navbar-brand" href="#">${wrapIcon(b.title||'Brand')}</a><button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nb${b.id}"><span class="navbar-toggler-icon"></span></button><div class="collapse navbar-collapse" id="nb${b.id}">${children}</div>`;
    else if(t==='sidebar') inner=(b.title||'').split(',').map(v=>`<a href="#" class="d-block py-1">${wrapIcon(v.trim())}</a>`).join('');
    else if(t==='breadcrumb') inner=`<ol class="breadcrumb">${(b.title||'').split(',').map((v,i,a)=>`<li class="breadcrumb-item${i===a.length-1?' active':''}">${i===a.length-1?v.trim():`<a href="#">${v.trim()}</a>`}</li>`).join('')}</ol>`;
    else if(t==='pagination') inner=`<ul class="pagination">${(b.title||'').split(',').map(v=>`<li class="page-item"><a class="page-link" href="#">${v.trim()}</a></li>`).join('')}</ul>`;
    else if(t==='tabs'||t==='pills') inner=(b.title||'').split(',').map((v,i)=>`<li class="nav-item"><a class="nav-link${i===0?' active':''}" href="#">${v.trim()}</a></li>`).join('');
    else if(t==='stepper') inner=(b.title||'').split(',').map((v,i)=>`<span class="badge ${i===0?'bg-primary':'bg-secondary'} me-1">${v.trim()}</span>`).join('');
    else if(t==='button-group') {
      const btnVar = b.bs_btn_variant ? 'btn-' + b.bs_btn_variant : 'btn-secondary';
      inner = (b.title||'').split(',').map(v=>`<button type="button" class="btn ${btnVar}">${v.trim()}</button>`).join('');
    }
    else if(t==='input-group') inner=`<span class="input-group-text">${b.title||''}</span><input class="form-control" placeholder="${b.placeholder||''}">`;
    else if(t==='accordion'){
      inner=(b.title||'Item').split(',').map((v,i)=>`<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button${i>0?' collapsed':''}" type="button" data-bs-toggle="collapse" data-bs-target="#acc_${b.cid}_${i}">${v.trim()}</button></h2><div id="acc_${b.cid}_${i}" class="accordion-collapse collapse${i===0?' show':''}"><div class="accordion-body">Content for ${v.trim()}</div></div></div>`).join('');
    }
    else if(t==='carousel'){
      const slides=(b.title||'Slide 1').split(',');
      inner=`<div class="carousel-inner">${slides.map((v,i)=>`<div class="carousel-item${i===0?' active':''}"><div class="d-block w-100 bg-secondary text-white text-center p-5">${v.trim()}</div></div>`).join('')}</div>
        <button class="carousel-control-prev" type="button" data-bs-target="#${b.id||b.cid}" data-bs-slide="prev"><span class="carousel-control-prev-icon"></span></button>
        <button class="carousel-control-next" type="button" data-bs-target="#${b.id||b.cid}" data-bs-slide="next"><span class="carousel-control-next-icon"></span></button>`;
    }
    else if(t==='modal'||t==='offcanvas') inner=`<div class="${t==='modal'?'modal-dialog':'offcanvas-body'}"><div class="${t==='modal'?'modal-content':''}">${t==='modal'?`<div class="modal-header"><h5 class="modal-title">${b.title||'Modal'}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>`:`<button type="button" class="btn-close text-reset float-end" data-bs-dismiss="offcanvas"></button><h5>${b.title||'Offcanvas'}</h5>`}<div class="${t==='modal'?'modal-body':''}">${b.body||''}${children}</div>${t==='modal'?'<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div>':''}</div></div>`;
    else if(t==='collapse') inner = b.body||children;
    else if(t==='details') return `<details ${id} class="${cls}" style="${style}" ${extraAttrs} data-cid="${b.cid}"><summary>${b.title||'Click to expand'}</summary>${b.body||children}</details>`;
    else if(t==='figure') inner=`<img src="${b.src||''}" class="figure-img img-fluid" alt=""><figcaption class="figure-caption">${b.caption||''}</figcaption>`;
    else if(t==='picture') inner=`<img src="${b.src||''}" alt="${b.alt||''}" class="img-fluid">`;
    else if(t==='video'||t==='audio') inner=children;
    else if(t==='canvas-el') inner='';
    else if(t==='svg') inner = b.body || '<circle cx="12" cy="12" r="10"/>';
    else if(t==='object-el') inner='';
    else if(t==='checkbox'||t==='radio'||t==='switch'){
      return `<div class="form-check${t==='switch'?' form-switch':''} ${cls}" style="${style}" data-cid="${b.cid}"><input class="form-check-input" type="${t==='radio'?'radio':'checkbox'}" ${id} name="${b.name||''}" value="${b.value||''}" ${b.checked?'checked':''} ${extraAttrs}><label class="form-check-label" ${b.id?`for="${b.id}"`:''} >${b.title||''}</label></div>`;
    }
    else if(t==='chart') {
      return `<div class="${cls}" style="${style};background:#1e1e2f;border-radius:8px;padding:12px;color:#fff;min-height:150px" data-cid="${b.cid}">
        <div style="font-size:12px;color:#888;margin-bottom:8px;display:flex;align-items:center">
          <i class="bi bi-bar-chart-line me-2"></i> ${b.title||'Chart'}
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:space-around;height:100px;padding-top:10px">
          <div style="width:12%;height:40%;background:#3b82f6;border-radius:3px 3px 0 0"></div>
          <div style="width:12%;height:70%;background:#3b82f6;border-radius:3px 3px 0 0"></div>
          <div style="width:12%;height:55%;background:#3b82f6;border-radius:3px 3px 0 0"></div>
          <div style="width:12%;height:90%;background:#10b981;border-radius:3px 3px 0 0"></div>
          <div style="width:12%;height:35%;background:#3b82f6;border-radius:3px 3px 0 0"></div>
        </div>
        <canvas id="${b.id||b.cid}" style="display:none"></canvas>
      </div>`;
    }
    else if(t==='sensor') {
      const val = b.state || '—';
      const sensorIcon = b.icon ? `<i class="bi ${b.icon} fs-1 text-primary opacity-50"></i>` : `<i class="bi bi-thermometer-half fs-1 text-primary opacity-50"></i>`;
      inner = `
        <div class="card-body p-3 d-flex align-items-center justify-content-between">
          <div>
            <div class="text-muted small">${b.title||'Sensor'}</div>
            <div class="fs-4 fw-bold text-primary" id="${b.response||b.id||'val'}">${val}</div>
          </div>
          <div>${sensorIcon}</div>
        </div>
      `;
    }
    else if(t==='toggle') return `<div class="form-check form-switch ${cls}" style="${style}" data-cid="${b.cid}"><input class="form-check-input" type="checkbox" ${id} ${b.state==='1'?'checked':''} ${extraAttrs}><label class="form-check-label">${b.title||'Toggle'}</label></div>`;
    else if(t==='knob'||t==='gauge') {
      const val = parseInt(b.value || b.state) || 0;
      const min = parseInt(b.min) || 0;
      const max = parseInt(b.max) || 100;
      const pct = Math.max(0, Math.min(100, Math.round(((val - min) / (max - min)) * 100)));
      const icon = b.icon ? `<i class="bi ${b.icon} fs-4 mb-1 d-block text-primary"></i>` : (t==='knob' ? `<i class="bi bi-circle-half fs-4 mb-1 d-block text-info"></i>` : `<i class="bi bi-speedometer2 fs-4 mb-1 d-block text-warning"></i>`);
      inner = `
        <div class="card-body p-3 d-flex flex-column align-items-center">
          ${icon}
          <div class="position-relative d-flex align-items-center justify-content-center my-2" style="width: 70px; height: 70px;">
            <svg style="width:70px; height:70px; transform: rotate(-90deg)" viewBox="0 0 36 36">
              <path class="text-light" stroke-width="3" stroke="rgba(0,0,0,0.1)" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path stroke-width="3" stroke-dasharray="${pct}, 100" stroke-linecap="round" stroke="${t==='knob'?'#0dcaf0':'#ffc107'}" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <div class="position-absolute fw-bold" style="font-size: 13px;" id="${b.response||b.id||'val'}">${val}${t==='knob'?'%':''}</div>
          </div>
          <div class="text-muted small fw-medium">${b.title||(t==='knob'?'Knob':'Gauge')}</div>
        </div>
      `;
    }
    else if(t==='rgb') {
      const icon = b.icon ? `<i class="bi ${b.icon} fs-1 text-primary"></i>` : `<i class="bi bi-palette2 fs-1 text-primary"></i>`;
      inner = `
        <div class="card-body p-3 d-flex flex-column align-items-center">
          ${icon}
          <div class="mt-2 fw-semibold" style="font-size:12px">${b.title||'RGB Color'}</div>
          <input type="color" ${id} class="form-control form-control-color mt-2" style="width:100%;height:30px;padding:2px" value="${b.value||'#ff0000'}" ${extraAttrs}>
        </div>
      `;
    }
    else if(t==='log-display') {
      inner = `
        <div style="color:#64e3ff;border-bottom:1px solid #333;padding-bottom:4px;margin-bottom:6px;font-size:10px;display:flex;align-items:center">
          <i class="bi bi-terminal me-2"></i> ${b.title||'System Logs'}
        </div>
        <div style="white-space:pre-wrap;color:#9be9a8" id="${b.id||'logs'}">${b.body || '[INFO] Waiting for logs...'}</div>
      `;
    }
    else if(t==='star-rating') {
      const val = parseInt(b.value) || 0;
      const max = parseInt(b.max) || 5;
      inner = `<div style="color:#f59e0b;font-size:16px">${'★'.repeat(val)}${'☆'.repeat(Math.max(0, max - val))}</div>`;
    }
    else if(t==='notification-bell') inner=`${iconHtml||'<i class="bi bi-bell-fill"></i>'}${b.badge?`<span class="badge bg-danger rounded-pill position-absolute top-0 start-100 translate-middle" style="font-size:9px">${b.badge}</span>`:''}`;
    else if(t==='back-top') inner=`<i class="bi bi-chevron-up"></i>`;
    else if(t==='close-btn') return `<button ${id} class="${cls||'btn-close'}" style="${style}" data-bs-dismiss="modal" aria-label="Close" ${extraAttrs} data-cid="${b.cid}"></button>`;
    else if(t==='loadJson'||t==='template'||t==='repeater'||t==='conditional') inner=`<div data-src="${b.state||''}" data-refresh="${b.refresh||''}">${children}</div>`;
    else if(t==='socket') inner=`<div data-ws="${b.state||''}" data-response="${b.response||''}">${children}</div>`;
    else if(t==='json-viewer') inner=`<pre class="m-0">${escHtml(b.state||'{}')}</pre>`;
    else if(t==='meta-block'||t==='og-block') inner = b.body||b.state||'';
    else if(t==='schema-block') return `<script ${id} ${extraAttrs} data-cid="${b.cid}">${b.state||'{}'}<\/script>`;
    else if(children) inner=wrapIcon(children);
    else inner=wrapIcon(innerText);
    let attrs=`${id} class="${cls}" style="${style}" data-cid="${b.cid}"`;
    if(tag==='button') attrs+=` type="${t==='reset'?'reset':(t==='submit'?'submit':'button')}"`;
    if(tag==='a') attrs+=` href="${b.href||'#'}" target="${b.target||''}"`;
    if(tag==='form') attrs+=` action="${b.action||''}" method="${b.method||'GET'}"`;
    if(tag==='video'||tag==='audio') attrs+=` src="${b.src||''}" ${b.controls?'controls':''} ${b.autoplay?'autoplay':''}`;
    if(tag==='iframe'||tag==='object'||tag==='canvas') attrs+=` src="${b.src||''}"`;
    if(b.role) attrs+=` role="${b.role}"`;
    if(b['data-bs-toggle']||b.bs_toggle) attrs+=` data-bs-toggle="${b['data-bs-toggle']||b.bs_toggle||''}"`;
    if(b.bs_placement) attrs+=` data-bs-placement="${b.bs_placement}"`;
    if(b.bs_title) attrs+=` title="${b.bs_title}"`;
    if(t==='multiselect') attrs+=' multiple';
    if(extraAttrs) attrs+=' '+extraAttrs;
    return `<${tag} ${attrs}>${inner}</${tag}>`;
  }

  const pageTitle = (meta.title||'').toString().trim() || 'Untitled Page';
  const favHref = (meta.favicon||'').toString().trim();
  const favTag = favHref ? `<link rel="icon" href="${favHref}">` : '';
  const descTag = meta.description ? `<meta name="description" content="${escHtml(meta.description)}">` : '';
  const themeColorTag = meta.themeColor ? `<meta name="theme-color" content="${meta.themeColor}">` : '';
  const ogTags = meta.description ? `<meta property="og:title" content="${escHtml(pageTitle)}"><meta property="og:description" content="${escHtml(meta.description)}">` : '';

  let htmlBody = content.map(renderEl).join('\n');
  
  // Feather Replacements {{key}} and [[key]]
  let mockObj = {};
  try { mockObj = JSON.parse(meta.mockData || '{}'); } catch(e){}
  
  htmlBody = htmlBody.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    return mockObj[key.trim()] !== undefined ? mockObj[key.trim()] : match;
  });
  htmlBody = htmlBody.replace(/\[\[([^\]]+)\]\]/g, (match, key) => {
    return mockObj[key.trim()] !== undefined ? mockObj[key.trim()] : match;
  });

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(pageTitle)}</title>${favTag}${descTag}${themeColorTag}${ogTags}<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"><link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet"></head><body class="p-4">${htmlBody}<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"><\\/script></body></html>`;
}

/* ═══════════════════════════════════════════════════
   EXPORT HTML
   ═══════════════════════════════════════════════════ */
function exportHtml() {
  const html = buildPreviewHtml();
  const blob = new Blob([html], {type: 'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  let dlName = (pageTitle || 'export').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.html';
  a.download = dlName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Exported to ' + dlName, 'success');
}


/* ═══════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════ */
function toast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg;
  el.className='show '+(type||'');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.className='',2200);
}

/* ═══════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ═══════════════════════════════════════════════════ */
document.addEventListener('keydown',e=>{
  if(!document.getElementById('canvas')) return; // not builder
  if(e.target.matches('input,textarea,select')) return;
  if(e.key==='Delete'&&selectedId){ deleteBlock(selectedId); }
  if(e.key==='Escape'&&selectedId){ selectedId=null; closeEditor(); }
  if(e.ctrlKey&&e.key==='z'){ e.preventDefault(); undoLast(); }
  if(e.ctrlKey&&e.key==='s'){ e.preventDefault(); showSaveModal(); }
  if(e.ctrlKey&&e.key==='j'){ e.preventDefault(); toggleJsonDrawer(); }
  if(e.ctrlKey&&e.key==='t'){ e.preventDefault(); toggleTreePanel(); }
});

/* ═══════════════════════════════════════════════════
   PAGE LAYOUTS & IOT PRESETS
   ═══════════════════════════════════════════════════ */
const PAGE_LAYOUTS = {
  landing: [
    {
      type: 'navbar',
      title: 'IoT Cloud Panel',
      class: 'navbar navbar-expand-lg navbar-dark bg-dark mb-4 p-3'
    },
    {
      type: 'jumbotron',
      title: 'Premium IoT Cloud Dashboard',
      body: 'Connect, monitor, and control your smart devices in real-time. Instantly load templates and deploy settings.',
      class: 'p-5 mb-4 bg-light rounded-3 text-center border'
    },
    {
      type: 'container',
      children: [
        {
          type: 'row',
          children: [
            {
              type: 'col',
              class: 'col-md-4',
              children: [
                {
                  type: 'card',
                  title: 'Real-time Metrics',
                  body: 'View beautiful sensor gauges, circular meters, and auto-refreshing graphs for temperature and humidity.',
                  class: 'card border-0 shadow-sm h-100 p-2'
                }
              ]
            },
            {
              type: 'col',
              class: 'col-md-4',
              children: [
                {
                  type: 'card',
                  title: 'Remote Switches',
                  body: 'Control your hardware devices with clean switches, commands, and RGB light color pickers.',
                  class: 'card border-0 shadow-sm h-100 p-2'
                }
              ]
            },
            {
              type: 'col',
              class: 'col-md-4',
              children: [
                {
                  type: 'card',
                  title: 'System Terminal Logs',
                  body: 'Track detailed device history, system booting steps, warnings, and WebSocket events in log displayers.',
                  class: 'card border-0 shadow-sm h-100 p-2'
                }
              ]
            }
          ]
        }
      ]
    },
    {
      type: 'footer',
      class: 'text-center py-4 mt-5 bg-dark text-light',
      title: 'IoT UI Builder — Powered by Bootstrap 5 & JSON'
    }
  ],
  dashboard: [
    {
      type: 'container-fluid',
      children: [
        {
          type: 'row',
          children: [
            {
              type: 'col',
              class: 'col-md-3 bg-dark text-white p-4 min-vh-100',
              children: [
                {
                  type: 'h4',
                  title: 'Control Center',
                  class: 'mb-4 text-primary'
                },
                {
                  type: 'sidebar',
                  title: 'Overview,Nodes Setup,System Logs,Security,Settings',
                  class: 'd-flex flex-column gap-2 bg-transparent text-white'
                }
              ]
            },
            {
              type: 'col',
              class: 'col-md-9 p-4',
              children: [
                {
                  type: 'row',
                  class: 'row align-items-center mb-4',
                  children: [
                    {
                      type: 'col',
                      class: 'col-md-8',
                      children: [{ type: 'h2', title: 'Analytics Dashboard' }]
                    },
                    {
                      type: 'col',
                      class: 'col-md-4 text-end',
                      children: [
                        {
                          type: 'notification-bell',
                          badge: '3',
                          class: 'btn btn-light position-relative shadow-sm rounded-circle p-2'
                        }
                      ]
                    }
                  ]
                },
                {
                  type: 'row',
                  class: 'row g-3 mb-4',
                  children: [
                    {
                      type: 'col',
                      class: 'col-md-4',
                      children: [
                        {
                          type: 'sensor',
                          title: 'Internal Temp',
                          state: '24.5 °C',
                          class: 'card border-0 shadow-sm bg-gradient p-2 text-primary',
                          style: 'background:linear-gradient(135deg,#e0f2fe,#bae6fd)'
                        }
                      ]
                    },
                    {
                      type: 'col',
                      class: 'col-md-4',
                      children: [
                        {
                          type: 'sensor',
                          title: 'WLAN Status',
                          state: 'Connected',
                          class: 'card border-0 shadow-sm bg-gradient p-2 text-success',
                          style: 'background:linear-gradient(135deg,#dcfce7,#bbf7d0)'
                        }
                      ]
                    },
                    {
                      type: 'col',
                      class: 'col-md-4',
                      children: [
                        {
                          type: 'sensor',
                          title: 'CPU Usage',
                          state: '18%',
                          class: 'card border-0 shadow-sm bg-gradient p-2 text-warning',
                          style: 'background:linear-gradient(135deg,#fef9c3,#fef08a)'
                        }
                      ]
                    }
                  ]
                },
                {
                  type: 'row',
                  class: 'row g-4',
                  children: [
                    {
                      type: 'col',
                      class: 'col-md-7',
                      children: [
                        {
                          type: 'card',
                          class: 'card border-0 shadow-sm p-3',
                          title: 'Connected Nodes Status',
                          children: [
                            {
                              type: 'data-table',
                              title: 'Node Name,IP Address,Status,Uptime',
                              class: 'table table-striped table-hover mt-3',
                              rows: 'ESP32_Kitchen,192.168.1.50,Online,12h 4m\nArduino_Garage,192.168.1.51,Offline,0m\nRasPi_Main,192.168.1.100,Online,5 days'
                            }
                          ]
                        }
                      ]
                    },
                    {
                      type: 'col',
                      class: 'col-md-5',
                      children: [
                        {
                          type: 'card',
                          class: 'card border-0 shadow-sm p-3',
                          title: 'Activity Chart',
                          children: [
                            {
                              type: 'chart',
                              title: 'Uptime Trend',
                              class: 'mt-3'
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  login: [
    {
      type: 'container',
      class: 'container py-5',
      children: [
        {
          type: 'row',
          children: [
            {
              type: 'col',
              class: 'col-md-5 mx-auto',
              children: [
                {
                  type: 'card',
                  class: 'card shadow border-0 p-4 mt-5',
                  title: 'Device Cloud Hub',
                  body: 'Please sign in to access your dashboard settings.',
                  children: [
                    {
                      type: 'form',
                      class: 'mt-3',
                      children: [
                        {
                          type: 'label',
                          title: 'Username / Email'
                        },
                        {
                          type: 'email',
                          placeholder: 'email@example.com',
                          class: 'form-control mb-3'
                        },
                        {
                          type: 'label',
                          title: 'Password'
                        },
                        {
                          type: 'password',
                          placeholder: '••••••••',
                          class: 'form-control mb-3'
                        },
                        {
                          type: 'checkbox',
                          title: 'Keep me signed in',
                          class: 'form-check-input mb-3'
                        },
                        {
                          type: 'submit',
                          title: 'Login to Admin',
                          class: 'btn btn-primary w-100 py-2'
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  blog: [
    {
      type: 'navbar',
      title: 'IoT Developers Blog',
      class: 'navbar navbar-expand-lg navbar-dark bg-primary mb-4 p-3'
    },
    {
      type: 'container',
      children: [
        {
          type: 'row',
          children: [
            {
              type: 'col',
              class: 'col-md-8',
              children: [
                {
                  type: 'h1',
                  title: 'Interfacing ESP32 and WebSockets in 2026',
                  class: 'mb-2'
                },
                {
                  type: 'p',
                  title: 'Published on June 24, 2026 by TechTeam',
                  class: 'text-muted small mb-4'
                },
                {
                  type: 'img',
                  src: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
                  class: 'img-fluid rounded mb-4 w-100',
                  style: 'max-height: 350px; object-fit: cover;'
                },
                {
                  type: 'p',
                  title: 'WebSockets provide a full-duplex communication channel over a single TCP connection. This is extremely useful for real-time monitoring panels where sensor data must be pushed instantly to the user interface.',
                  class: 'lead mb-3'
                },
                {
                  type: 'blockquote',
                  title: 'Real-time feedback loops are critical for industrial telemetry, preventing equipment overheating and detecting failures within milliseconds.',
                  class: 'blockquote border-start border-primary border-4 ps-3 py-1 my-4 bg-light'
                },
                {
                  type: 'p',
                  title: 'Using the JSON Page Loader, developers can map live inputs directly to widgets without reloading the browser. Let us take a look at setting up a WebSocket connection.'
                }
              ]
            },
            {
              type: 'col',
              class: 'col-md-4',
              children: [
                {
                  type: 'card',
                  class: 'card border-0 shadow-sm p-3 mb-4',
                  title: 'About the Author',
                  body: 'Alex Mercer is an embedded software engineer specializing in low-latency communication networks.'
                },
                {
                  type: 'card',
                  class: 'card border-0 shadow-sm p-3',
                  title: 'Related Tags',
                  children: [
                    {
                      type: 'list-group',
                      title: 'ESP32 IoT,WebSockets,Bootstrap 5,Real-time telemetry'
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  contact: [
    {
      type: 'navbar',
      title: 'SmartSolutions Inc.',
      class: 'navbar navbar-expand-lg navbar-dark bg-dark mb-4 p-3'
    },
    {
      type: 'container',
      children: [
        {
          type: 'h2',
          title: 'Contact Support Desk',
          class: 'mb-4 text-center'
        },
        {
          type: 'row',
          children: [
            {
              type: 'col',
              class: 'col-md-5',
              children: [
                {
                  type: 'h4',
                  title: 'Headquarters'
                },
                {
                  type: 'address',
                  title: '100 Innovation Way, Silicon Forest, CA 94016',
                  class: 'mb-3'
                },
                {
                  type: 'p',
                  title: 'Phone: +1 (555) 902-1049\nEmail: contact@smartsolutions.io',
                  class: 'text-muted'
                }
              ]
            },
            {
              type: 'col',
              class: 'col-md-7',
              children: [
                {
                  type: 'card',
                  class: 'card border-0 shadow-sm p-4',
                  title: 'Drop Us a Message',
                  children: [
                    {
                      type: 'form',
                      children: [
                        {
                          type: 'label',
                          title: 'Your Name'
                        },
                        {
                          type: 'input',
                          placeholder: 'John Doe',
                          class: 'form-control mb-3'
                        },
                        {
                          type: 'label',
                          title: 'Email Address'
                        },
                        {
                          type: 'email',
                          placeholder: 'john@example.com',
                          class: 'form-control mb-3'
                        },
                        {
                          type: 'label',
                          title: 'Message Description'
                        },
                        {
                          type: 'textarea',
                          placeholder: 'Type your message...',
                          class: 'form-control mb-3',
                          rows: '4'
                        },
                        {
                          type: 'submit',
                          title: 'Send Message',
                          class: 'btn btn-primary py-2 px-4'
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  settings: [
    {
      type: 'navbar',
      title: 'Console Control',
      class: 'navbar navbar-expand-lg navbar-dark bg-dark mb-4 p-3'
    },
    {
      type: 'container',
      children: [
        {
          type: 'card',
          class: 'card border-0 shadow-sm p-4',
          title: 'System Preferences',
          children: [
            {
              type: 'form',
              class: 'mt-3',
              children: [
                {
                  type: 'label',
                  title: 'Device Node Prefix'
                },
                {
                  type: 'input',
                  value: 'dev_node_441',
                  class: 'form-control mb-3'
                },
                {
                  type: 'label',
                  title: 'Server URL'
                },
                {
                  type: 'url',
                  value: 'https://api.iotcloud.io/v1',
                  class: 'form-control mb-3'
                },
                {
                  type: 'label',
                  title: 'Data Polling Time (seconds)'
                },
                {
                  type: 'number',
                  value: '5',
                  class: 'form-control mb-3',
                  min: '1',
                  max: '60'
                },
                {
                  type: 'switch',
                  title: 'Enable background sync',
                  class: 'form-check-input mb-3',
                  checked: true
                },
                {
                  type: 'button',
                  title: 'Save Settings',
                  class: 'btn btn-primary px-4'
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  'dashboard-left-sidebar': [
    {
      type: 'navbar',
      title: 'LeftSidebar UI',
      class: 'navbar navbar-expand-lg navbar-dark bg-dark p-3',
      children: [
        { type: 'notification-bell', badge: '5', class: 'btn btn-outline-light ms-auto rounded-circle p-2 position-relative' }
      ]
    },
    {
      type: 'container-fluid',
      class: 'p-0',
      children: [
        {
          type: 'row',
          class: 'g-0',
          children: [
            {
              type: 'col',
              class: 'col-md-2 bg-light border-end min-vh-100 p-3',
              children: [
                { type: 'sidebar', title: 'Dashboard,Analytics,Settings,Logout', class: 'd-flex flex-column gap-2' }
              ]
            },
            {
              type: 'col',
              class: 'col-md-10 p-4',
              children: [
                { type: 'h2', title: 'Main Content Area' },
                { type: 'p', title: 'This layout features a fixed top navbar and a left sidebar.' },
                {
                  type: 'row', class: 'g-3 mt-3',
                  children: [
                    { type: 'col', class: 'col-md-6', children: [{ type: 'card', title: 'Card 1', body: 'Content here' }] },
                    { type: 'col', class: 'col-md-6', children: [{ type: 'card', title: 'Card 2', body: 'Content here' }] }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  'dashboard-right-sidebar': [
    {
      type: 'navbar',
      title: 'RightSidebar UI',
      class: 'navbar navbar-expand-lg navbar-dark bg-primary p-3'
    },
    {
      type: 'container-fluid',
      class: 'p-0',
      children: [
        {
          type: 'row',
          class: 'g-0 flex-row-reverse',
          children: [
            {
              type: 'col',
              class: 'col-md-3 bg-light border-start min-vh-100 p-3 shadow-sm',
              children: [
                { type: 'h5', title: 'Quick Actions', class: 'mb-3' },
                { type: 'sidebar', title: 'Profile,Messages,Tasks', class: 'd-flex flex-column gap-2' },
                { type: 'divider-bs', class: 'my-3' },
                { type: 'toast', title: 'System Alert\nDisk space running low', class: 'toast show border-warning' }
              ]
            },
            {
              type: 'col',
              class: 'col-md-9 p-4',
              children: [
                { type: 'h2', title: 'Dashboard Area' },
                { type: 'p', title: 'This layout features a right-side navigation panel.' },
                { type: 'button', title: 'Open Settings Modal', attrs: 'data-bs-toggle="modal" data-bs-target="#settingsModal"', class: 'btn btn-primary mt-3' }
              ]
            }
          ]
        }
      ]
    },
    {
      type: 'modal',
      title: 'Settings Modal',
      id: 'settingsModal',
      class: 'modal fade',
      body: 'Configure your preferences here.',
      children: [
        { type: 'form', children: [{ type: 'label', title: 'Theme Color' }, { type: 'color' }] }
      ]
    }
  ],
  'iot-advanced-panel': [
    {
      type: 'container',
      class: 'py-4',
      children: [
        {
          type: 'row', class: 'align-items-center mb-4',
          children: [
            { type: 'col', class: 'col-md-8', children: [{ type: 'h2', title: 'Advanced IoT Control Panel', icon: 'bi-cpu' }] },
            { type: 'col', class: 'col-md-4 text-end', children: [{ type: 'notification-bell', badge: '12', class: 'btn btn-light rounded-circle p-2 shadow-sm' }] }
          ]
        },
        {
          type: 'row', class: 'g-4',
          children: [
            {
              type: 'col', class: 'col-md-4',
              children: [
                { type: 'card', class: 'card border-0 shadow-sm h-100', title: 'Environment', children: [
                  { type: 'sensor', title: 'Temp', state: '22°C', icon: 'bi-thermometer-half' },
                  { type: 'sensor', title: 'Humidity', state: '45%', icon: 'bi-droplet' },
                  { type: 'sensor', title: 'Air Quality', state: '98%', icon: 'bi-wind' }
                ]}
              ]
            },
            {
              type: 'col', class: 'col-md-4',
              children: [
                { type: 'card', class: 'card border-0 shadow-sm h-100', title: 'Controls', children: [
                  { type: 'toggle', title: 'Main Power', state: '1', class: 'form-check form-switch fs-5 mb-2' },
                  { type: 'toggle', title: 'Auto Cooling', state: '0', class: 'form-check form-switch fs-5 mb-2' },
                  { type: 'knob', title: 'Fan Speed', state: '60', icon: 'bi-fan', class: 'mt-3 text-center' }
                ]}
              ]
            },
            {
              type: 'col', class: 'col-md-4',
              children: [
                { type: 'card', class: 'card border-0 shadow-sm h-100', title: 'System Logs', children: [
                  { type: 'log-display', title: 'Live Events', state: '', body: '[OK] Boot successful\n[INFO] Connecting to WiFi...\n[OK] Connected to AP', class: 'bg-dark text-success font-monospace p-3', style: 'height:200px;overflow:auto;border-radius:8px' }
                ]}
              ]
            }
          ]
        }
      ]
    }
  ]
};

const IOT_PRESETS = {
  'sensor-grid': [
    {
      type: 'row',
      class: 'row g-3',
      children: [
        {
          type: 'col',
          class: 'col-md-4',
          children: [
            {
              type: 'sensor',
              title: 'Temperature Sensor',
              state: '26.8 °C',
              class: 'card border-0 shadow-sm bg-gradient p-2 text-primary',
              style: 'background:linear-gradient(135deg,#ffe4e6,#fecdd3)',
              icon: 'bi-thermometer-half'
            }
          ]
        },
        {
          type: 'col',
          class: 'col-md-4',
          children: [
            {
              type: 'sensor',
              title: 'Humidity Level',
              state: '58 %',
              class: 'card border-0 shadow-sm bg-gradient p-2 text-success',
              style: 'background:linear-gradient(135deg,#e0f2fe,#bae6fd)',
              icon: 'bi-droplet'
            }
          ]
        },
        {
          type: 'col',
          class: 'col-md-4',
          children: [
            {
              type: 'sensor',
              title: 'Atmospheric Pressure',
              state: '1013 hPa',
              class: 'card border-0 shadow-sm bg-gradient p-2 text-info',
              style: 'background:linear-gradient(135deg,#f0fdf4,#dcfce7)',
              icon: 'bi-speedometer'
            }
          ]
        }
      ]
    }
  ],
  'toggle-panel': [
    {
      type: 'card',
      class: 'card border-0 shadow-sm p-3',
      title: 'Power Relay Hub',
      children: [
        {
          type: 'row',
          class: 'row g-3 mt-1',
          children: [
            {
              type: 'col',
              class: 'col-md-6',
              children: [
                {
                  type: 'toggle',
                  title: 'Living Room Lights',
                  state: '1',
                  class: 'form-check form-switch fs-5 p-2 bg-light rounded border border-light shadow-sm'
                }
              ]
            },
            {
              type: 'col',
              class: 'col-md-6',
              children: [
                {
                  type: 'toggle',
                  title: 'Cooling Fan Relay',
                  state: '0',
                  class: 'form-check form-switch fs-5 p-2 bg-light rounded border border-light shadow-sm'
                }
              ]
            },
            {
              type: 'col',
              class: 'col-md-6',
              children: [
                {
                  type: 'toggle',
                  title: 'Water Pump Switch',
                  state: '0',
                  class: 'form-check form-switch fs-5 p-2 bg-light rounded border border-light shadow-sm'
                }
              ]
            },
            {
              type: 'col',
              class: 'col-md-6',
              children: [
                {
                  type: 'toggle',
                  title: 'Main Heater Valve',
                  state: '1',
                  class: 'form-check form-switch fs-5 p-2 bg-light rounded border border-light shadow-sm'
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  'gauge-dashboard': [
    {
      type: 'row',
      class: 'row g-3',
      children: [
        {
          type: 'col',
          class: 'col-md-4',
          children: [
            {
              type: 'gauge',
              title: 'CPU Usage',
              state: '48',
              class: 'card border-0 shadow-sm p-3 text-center',
              icon: 'bi-cpu'
            }
          ]
        },
        {
          type: 'col',
          class: 'col-md-4',
          children: [
            {
              type: 'gauge',
              title: 'RAM Utilization',
              state: '72',
              class: 'card border-0 shadow-sm p-3 text-center',
              icon: 'bi-memory'
            }
          ]
        },
        {
          type: 'col',
          class: 'col-md-4',
          children: [
            {
              type: 'gauge',
              title: 'Disk Space',
              state: '84',
              class: 'card border-0 shadow-sm p-3 text-center',
              icon: 'bi-hdd'
            }
          ]
        }
      ]
    }
  ],
  'device-control': [
    {
      type: 'card',
      class: 'card border-0 shadow-sm p-4',
      title: 'Smart Luminary Control',
      children: [
        {
          type: 'row',
          class: 'row g-3 align-items-center',
          children: [
            {
              type: 'col',
              class: 'col-md-4 text-center',
              children: [
                {
                  type: 'toggle',
                  title: 'Power Status',
                  state: '1',
                  class: 'form-check form-switch fs-5 d-inline-block'
                }
              ]
            },
            {
              type: 'col',
              class: 'col-md-4 text-center',
              children: [
                {
                  type: 'rgb',
                  title: 'Light Color',
                  class: 'card border-0 shadow-sm p-3 text-center mx-auto'
                }
              ]
            },
            {
              type: 'col',
              class: 'col-md-4 text-center',
              children: [
                {
                  type: 'knob',
                  title: 'Brightness',
                  state: '75',
                  class: 'card border-0 shadow-sm p-3 text-center mx-auto'
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  'log-monitor': [
    {
      type: 'card',
      class: 'card border-0 shadow-sm p-3',
      title: 'Diagnostics Terminal',
      children: [
        {
          type: 'sensor',
          title: 'System Health Status',
          state: 'Normal',
          class: 'card border-0 shadow-sm bg-gradient p-2 text-success mb-3',
          style: 'background:linear-gradient(135deg,#f0fdf4,#dcfce7)',
          icon: 'bi-shield-check'
        },
        {
          type: 'log-display',
          title: 'Tail System Console logs',
          state: 'diagnostic_logs.txt',
          class: 'bg-dark text-success font-monospace p-3',
          style: 'height:160px;overflow:auto;border-radius:8px',
          body: '[08:30:02] ESP32 node registered with ID 441\n[08:30:05] Socket connection established successfully\n[08:35:10] Ping reply: 14ms\n[08:40:00] Sending keepalive packet...'
        }
      ]
    }
  ],
  'alert-panel': [
    {
      type: 'card',
      class: 'card border-0 shadow-sm p-3',
      title: 'Incident Monitor',
      children: [
        {
          type: 'flexbox',
          class: 'd-flex justify-content-between align-items-center mb-3',
          children: [
            {
              type: 'h5',
              title: 'Active Fault Notifications',
              class: 'm-0 text-danger'
            },
            {
              type: 'notification-bell',
              badge: '2',
              class: 'btn btn-outline-danger position-relative rounded-circle p-2'
            }
          ]
        },
        {
          type: 'alert',
          title: 'Warning: Core node temperature exceeded 85°C safety threshold!',
          class: 'alert alert-danger mb-2',
          dismissible: true
        },
        {
          type: 'alert',
          title: 'Alert: Backup power generator fails to ping main controller.',
          class: 'alert alert-warning mb-0',
          dismissible: true
        }
      ]
    }
  ]
};

function renderLayoutsPanel() {
  const container = document.getElementById('layouts-body');
  if(!container) return;

  const pages = [
    { key: 'landing', name: 'Landing Page', desc: 'Hero section, columns, footer', icon: 'bi-file-earmark-richtext', color: '#3b82f6' },
    { key: 'dashboard', name: 'Admin Dashboard', desc: 'Sidebar, metrics, table, chart', icon: 'bi-grid-1x2', color: '#10b981' },
    { key: 'login', name: 'Login Page', desc: 'Card centered form', icon: 'bi-lock', color: '#f59e0b' },
    { key: 'blog', name: 'Blog Post', desc: 'Article content and tag sidebar', icon: 'bi-newspaper', color: '#6366f1' },
    { key: 'contact', name: 'Contact Page', desc: 'Address details and feedback form', icon: 'bi-envelope', color: '#ec4899' },
    { key: 'settings', name: 'Settings Page', desc: 'Preferences, selectors, switches', icon: 'bi-gear', color: '#06b6d4' }
  ];

  const iot = [
    { key: 'sensor-grid', name: 'Sensor Card Grid', desc: 'Temp, Humidity, Pressure widgets', icon: 'bi-thermometer-half', color: '#ef4444' },
    { key: 'toggle-panel', name: 'Toggle Switch Panel', desc: 'Smart relays switch array', icon: 'bi-toggle-on', color: '#8b5cf6' },
    { key: 'gauge-dashboard', name: 'Circular Gauges', desc: 'CPU, RAM, HDD storage gauges', icon: 'bi-speedometer2', color: '#eab308' },
    { key: 'device-control', name: 'Smart Device Node', desc: 'Power toggle, RGB color, knob', icon: 'bi-palette2', color: '#a855f7' },
    { key: 'log-monitor', name: 'Diagnostics Logs', desc: 'Diagnostic console event logs', icon: 'bi-journal-text', color: '#10b981' },
    { key: 'alert-panel', name: 'Alert Incident Desk', desc: 'Fault alerts, notification badge', icon: 'bi-exclamation-triangle', color: '#f97316' }
  ];

  let html = '';

  html += `<div class="layouts-cat-header"><i class="bi bi-window-stack"></i> Pre-built Pages</div>`;
  html += `<div class="layouts-grid">`;
  pages.forEach(p => {
    html += `
      <div class="layout-card" onclick="loadLayout('${p.key}')">
        <div class="layout-icon-wrap" style="background: ${p.color}15; color: ${p.color}">
          <i class="bi ${p.icon}"></i>
        </div>
        <div class="layout-info">
          <div class="layout-title">${p.name}</div>
          <div class="layout-desc">${p.desc}</div>
        </div>
        <div class="layout-action-hint"><i class="bi bi-plus-circle"></i> Load</div>
      </div>
    `;
  });
  html += `</div>`;

  html += `<div class="layouts-cat-header mt-3"><i class="bi bi-cpu"></i> IoT Presets (Section)</div>`;
  html += `<div class="layouts-grid">`;
  iot.forEach(p => {
    html += `
      <div class="layout-card" onclick="loadSectionPreset('${p.key}')">
        <div class="layout-icon-wrap" style="background: ${p.color}15; color: ${p.color}">
          <i class="bi ${p.icon}"></i>
        </div>
        <div class="layout-info">
          <div class="layout-title">${p.name}</div>
          <div class="layout-desc">${p.desc}</div>
        </div>
        <div class="layout-action-hint"><i class="bi bi-plus-circle"></i> Insert</div>
      </div>
    `;
  });
  html += `</div>`;

  container.innerHTML = html;
}

function loadLayout(key) {
  if (blocks.length > 0 && !confirm("Loading this page layout will clear your current canvas. Continue?")) {
    return;
  }
  pushUndo();
  const layout = PAGE_LAYOUTS[key];
  if (layout) {
    blocks = layout.map(b => inflateBlock(b));
    selectedId = null;
    closeEditor();
    renderAll();
    toast("Loaded layout: " + key, "success");
  }
}

function loadSectionPreset(key) {
  pushUndo();
  const preset = IOT_PRESETS[key];
  if (preset) {
    const newBlocks = preset.map(b => inflateBlock(b));
    blocks.push(...newBlocks);
    selectedId = null;
    closeEditor();
    renderAll();
    toast("Inserted IoT preset: " + key, "success");
  }
}

/* ═══════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════ */
// Only init builder if we're on the builder page (canvas exists)
if(document.getElementById('canvas')){
  renderPalette();
  renderLayoutsPanel();
  renderAll();
  initDB();
}
// tree-toggle-btn is only present in legacy layout; the new layout uses setLeftTab()
