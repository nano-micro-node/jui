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
  div:      {tag:'div',title:'',id:'',class:'',style:'',attrs:'',children:true},
  container:{tag:'div',title:'',id:'',class:'container',style:'',attrs:'',children:true},
  'container-fluid':{tag:'div',title:'',id:'',class:'container-fluid',style:'',attrs:'',children:true},
  row:      {tag:'div',title:'',id:'',class:'row',style:'',attrs:'',children:true},
  col:      {tag:'div',title:'Content',id:'',class:'col',style:'',attrs:'',children:true},
  flexbox:  {tag:'div',title:'',id:'',class:'d-flex align-items-center justify-content-between',style:'',attrs:'',children:true},
  grid:     {tag:'div',title:'',id:'',class:'d-grid',style:'grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;',attrs:'',children:true},
  section:  {tag:'section',title:'',id:'',class:'',style:'py:3',attrs:'',children:true},
  article:  {tag:'article',title:'',id:'',class:'',style:'',attrs:'',children:true},
  aside:    {tag:'aside',title:'',id:'',class:'',style:'',attrs:'',children:true},
  header:   {tag:'header',title:'',id:'',class:'',style:'',attrs:'',children:true},
  footer:   {tag:'footer',title:'',id:'',class:'',style:'',attrs:'',children:true},
  main:     {tag:'main',title:'',id:'',class:'',style:'',attrs:'',children:true},
  body:     {tag:'body',title:'Page Body',id:'',class:'',style:'',attrs:'',children:true},
  card:     {tag:'div',title:'Card Title',id:'',class:'card',style:'',body:'Card body text.',attrs:'',children:true},
  'card-header':{tag:'div',title:'Card Header',id:'',class:'card-header',style:'',attrs:'',children:true},
  'card-body':{tag:'div',title:'Card Body',id:'',class:'card-body',style:'',attrs:'',children:true},
  'card-footer':{tag:'div',title:'Card Footer',id:'',class:'card-footer',style:'',attrs:'',children:true},
  accordion:{tag:'div',title:'Collapse',id:'acc1',class:'accordion',style:'',attrs:'',children:false},
  modal:    {tag:'div',title:'Modal Title',id:'modal1',class:'modal fade',style:'',attrs:'',children:false},
  offcanvas:{tag:'div',title:'Offcanvas Title',id:'offcanvas1',class:'offcanvas offcanvas-start',style:'',attrs:'',children:true},
  tabs:     {tag:'ul',title:'Tab 1,Tab 2',id:'',class:'nav nav-tabs',style:'',attrs:'',children:false},
  pills:    {tag:'ul',title:'Tab 1,Tab 2',id:'',class:'nav nav-pills',style:'',attrs:'',children:false},
  jumbotron:{tag:'div',title:'Hero Title',id:'',class:'p-5 mb-4 bg-light rounded-3',style:'',body:'Hero body text here.',attrs:'',children:true},
  split:    {tag:'div',title:'',id:'',class:'row',style:'',attrs:'',children:true},
  stack:    {tag:'div',title:'',id:'',class:'vstack gap-3',style:'',attrs:'',children:true},
  wrap:     {tag:'div',title:'',id:'',class:'d-flex flex-wrap gap-2',style:'',attrs:'',children:true},
  details:  {tag:'details',title:'Summary Label',id:'',class:'p-2',style:'',body:'Hidden text details.',attrs:'',children:true},
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
  mark:  {tag:'mark',title:'Highlighted text',id:'',class:'',style:'',attrs:''},
  abbr:  {tag:'abbr',title:'Abbr text',id:'',class:'',style:'',attrs:'title="Explanation"'},
  kbd:   {tag:'kbd',title:'Ctrl+S',id:'',class:'',style:'',attrs:''},
  del:   {tag:'del',title:'Deleted text',id:'',class:'',style:'',attrs:''},
  sub:   {tag:'sub',title:'subscript',id:'',class:'',style:'',attrs:''},
  sup:   {tag:'sup',title:'superscript',id:'',class:'',style:'',attrs:''},
  time:  {tag:'input',title:'',id:'time1',name:'time1',class:'form-control',style:'',type:'time',value:'',attrs:''},
  address:{tag:'address',title:'123 Main St',id:'',class:'',style:'',attrs:''},
  cite:  {tag:'cite',title:'Citation Source',id:'',class:'',style:'',attrs:''},
  dfn:   {tag:'dfn',title:'Definition',id:'',class:'',style:'',attrs:''},
  samp:  {tag:'samp',title:'Sample Output',id:'',class:'',style:'',attrs:''},
  var:   {tag:'var',title:'x',id:'',class:'',style:'',attrs:''},
  bdi:   {tag:'bdi',title:'Isolated text',id:'',class:'',style:'',attrs:''},
  form:    {tag:'form',title:'',id:'',class:'',style:'',action:'',method:'GET',attrs:'',children:true},
  fieldset:{tag:'fieldset',title:'',id:'',class:'border p-3',style:'',attrs:'',children:true},
  legend:  {tag:'legend',title:'Legend',id:'',class:'w-auto px-2',style:'',attrs:''},
  input:   {tag:'input',title:'Enter value',id:'inp1',name:'inp1',class:'form-control',style:'',type:'text',placeholder:'',value:'',action:'',attrs:''},
  textarea:{tag:'textarea',title:'',id:'ta1',name:'ta1',class:'form-control',style:'',rows:'3',placeholder:'',value:'',action:'',attrs:''},
  select:  {tag:'select',title:'',id:'sel1',name:'sel1',class:'form-select',style:'',options:'Option 1,Option 2,Option 3',action:'',attrs:''},
  multiselect:{tag:'select',title:'',id:'msel1',name:'msel1',class:'form-select',style:'',options:'Option 1,Option 2,Option 3',attrs:'multiple'},
  checkbox:{tag:'input',title:'Enable this',id:'chk1',name:'chk1',class:'form-check-input',style:'',checked:'',action:'',attrs:''},
  radio:   {tag:'input',title:'Option A',id:'rad1',name:'radioGroup',class:'form-check-input',style:'',value:'A',action:'',attrs:''},
  range:   {tag:'input',title:'Brightness',id:'rng1',name:'rng1',class:'form-range',style:'',min:'0',max:'100',value:'50',step:'1',action:'',attrs:''},
  button:  {tag:'button',title:'Click Me',id:'',class:'btn btn-primary',style:'',type:'button',action:'',attrs:''},
  'button-group':{tag:'div',title:'',id:'',class:'btn-group',style:'',attrs:'',children:true},
  'input-group': {tag:'div',title:'',id:'',class:'input-group',style:'',attrs:'',children:true},
  submit:  {tag:'button',title:'Submit',id:'',class:'btn btn-success',style:'',type:'submit',action:'',attrs:''},
  reset:   {tag:'button',title:'Reset',id:'',class:'btn btn-secondary',style:'',type:'reset',action:'',attrs:''},
  file:    {tag:'input',title:'',id:'file1',name:'file1',class:'form-control',style:'',accept:'*',attrs:''},
  color:   {tag:'input',title:'Pick color',id:'col1',name:'col1',class:'form-control form-control-color',style:'',value:'#3b82f6',attrs:''},
  date:    {tag:'input',title:'',id:'dt1',name:'dt1',class:'form-control',style:'',value:'',attrs:''},
  datetime:{tag:'input',title:'',id:'dt1',name:'dt1',class:'form-control',style:'',type:'datetime-local',value:'',attrs:''},
  week:    {tag:'input',title:'',id:'wk1',name:'wk1',class:'form-control',style:'',type:'week',value:'',attrs:''},
  month:   {tag:'input',title:'',id:'mn1',name:'mn1',class:'form-control',style:'',type:'month',value:'',attrs:''},
  number:  {tag:'input',title:'',id:'num1',name:'num1',class:'form-control',style:'',min:'',max:'',step:'',value:'',attrs:''},
  tel:     {tag:'input',title:'',id:'tel1',name:'tel1',class:'form-control',style:'',type:'tel',placeholder:'Phone number',value:'',attrs:''},
  email:   {tag:'input',title:'',id:'em1',name:'em1',class:'form-control',style:'',type:'email',placeholder:'Email address',value:'',attrs:''},
  url:     {tag:'input',title:'',id:'url1',name:'url1',class:'form-control',style:'',type:'url',placeholder:'https://example.com',value:'',attrs:''},
  password:{tag:'input',title:'',id:'pwd1',name:'pwd1',class:'form-control',style:'',type:'password',placeholder:'Password',value:'',attrs:''},
  search:  {tag:'input',title:'',id:'srch1',name:'srch1',class:'form-control',style:'',placeholder:'Search…',attrs:''},
  hidden:  {tag:'input',title:'',id:'hid1',name:'hid1',class:'',style:'',type:'hidden',value:'',attrs:''},
  switch:  {tag:'input',title:'Toggle',id:'sw1',name:'sw1',class:'form-check-input',style:'',role:'switch',checked:'',action:'',attrs:''},
  datalist:{tag:'datalist',title:'',id:'dl1',class:'',style:'',options:'Item 1,Item 2,Item 3',attrs:''},
  output:  {tag:'output',title:'Result output',id:'out1',name:'out1',class:'',style:'',attrs:''},
  meter:   {tag:'meter',title:'',id:'met1',class:'',style:'',min:'0',max:'100',value:'60',attrs:'low="33" high="66" optimum="80"'},
  'progress-el':{tag:'progress',title:'',id:'pel1',class:'w-100',style:'',max:'100',value:'70',attrs:''},
  img:    {tag:'img',title:'',id:'',class:'img-fluid',style:'',src:'https://picsum.photos/600/400',alt:'Image',attrs:''},
  picture:{tag:'picture',title:'',id:'',class:'',style:'',attrs:'',children:true},
  svg:    {tag:'svg',title:'',id:'',class:'bi',style:'',body:'<circle cx="8" cy="8" r="8"/>',attrs:'width="32" height="32" viewBox="0 0 16 16" fill="currentColor"'},
  'canvas-el':{tag:'canvas',title:'',id:'canv1',class:'border',style:'',attrs:'width="200" height="100"'},
  video:  {tag:'video',title:'',id:'',class:'w-100',style:'',src:'',controls:'true',autoplay:'',attrs:''},
  audio:  {tag:'audio',title:'',id:'',class:'',style:'',src:'',controls:'true',attrs:''},
  iframe: {tag:'iframe',title:'',id:'',class:'w-100',style:'height:300px',src:'',attrs:''},
  figure: {tag:'figure',title:'',id:'',class:'figure',style:'',src:'https://picsum.photos/600/400',caption:'Figure caption',attrs:''},
  'object-el':{tag:'object',title:'',id:'',class:'w-100',style:'height:200px',src:'',attrs:'type="application/pdf"'},
  'embed-el':{tag:'embed',title:'',id:'',class:'w-100',style:'height:200px',src:'',attrs:'type="text/html"'},
  source: {tag:'source',title:'',id:'',class:'',style:'',src:'',attrs:'type="video/mp4"'},
  nav:       {tag:'nav',title:'',id:'',class:'',style:'',attrs:'',children:true},
  navbar:    {tag:'nav',title:'Navbar Brand',id:'',class:'navbar navbar-expand-lg navbar-dark bg-dark',style:'',attrs:'',children:false},
  sidebar:   {tag:'div',title:'',id:'',class:'bg-dark text-white p-3',style:'width:280px; min-height:100vh;',attrs:'',children:true},
  a:         {tag:'a',title:'Link text',id:'',class:'',style:'',href:'#',target:'',attrs:''},
  breadcrumb:{tag:'nav',title:'Home,Section,Current',id:'',class:'',style:'',attrs:''},
  pagination:{tag:'nav',title:'Prev,1,2,3,Next',id:'',class:'',style:'',attrs:''},
  stepper:   {tag:'div',title:'',id:'',class:'d-flex justify-content-between',style:'',attrs:'',children:true},
  menu:      {tag:'ul',title:'',id:'',class:'list-unstyled',style:'',attrs:'',children:true},
  alert:    {tag:'div',title:'Alert message here',id:'',class:'alert alert-primary',style:'',role:'alert',dismissible:'',attrs:''},
  badge:    {tag:'span',title:'New',id:'',class:'badge bg-primary',style:'',attrs:''},
  progress: {tag:'div',title:'',id:'',class:'progress',style:'',value:'75',attrs:''},
  spinner:  {tag:'div',title:'Loading...',id:'',class:'spinner-border text-primary',style:'',role:'status',attrs:''},
  placeholder:{tag:'span',title:'',id:'',class:'placeholder col-6',style:'',attrs:''},
  toast:    {tag:'div',title:'Toast Title\nBody text.',id:'',class:'toast show',style:'',attrs:''},
  tooltip:  {tag:'span',title:'Hover me',id:'',class:'',style:'',bs_toggle:'tooltip',bs_placement:'top',bs_title:'Tooltip text',attrs:''},
  popover:  {tag:'button',title:'Click for Popover',id:'',class:'btn btn-secondary',style:'',attrs:'data-bs-toggle="popover" data-bs-content="Popover content" title="Popover Title"'},
  dropdown: {tag:'div',title:'Dropdown',id:'',class:'dropdown',style:'',options:'Action,Another,Divider,Something else',attrs:''},
  'list-group':{tag:'ul',title:'Item 1,Item 2,Item 3',id:'',class:'list-group',style:'',attrs:''},
  table:    {tag:'table',title:'Name,Age,Role',id:'',class:'table table-bordered',style:'',rows:'Alice,30,Admin\nBob,25,User',attrs:''},
  carousel: {tag:'div',title:'',id:'caro1',class:'carousel slide',style:'',attrs:'data-bs-ride="carousel"',children:true},
  collapse: {tag:'div',title:'',id:'coll1',class:'collapse',style:'',attrs:'',children:true},
  'close-btn':{tag:'button',title:'',id:'',class:'btn-close',style:'',attrs:'aria-label="Close"'},
  'divider-bs':{tag:'hr',title:'',id:'',class:'border border-primary border-3 opacity-75',style:'',attrs:''},
  loadJson: {tag:'div',title:'',id:'',class:'',style:'',state:'section.json',refresh:'',action:'',attrs:'',children:true},
  chart:    {tag:'canvas',title:'Temperature',id:'ch1',class:'',style:'height:200px',state:'data.csv',attrs:''},
  template: {tag:'div',title:'',id:'',class:'',style:'',state:'template.json',attrs:''},
  socket:   {tag:'div',title:'',id:'',class:'',style:'',state:'ws://localhost:8080',response:'',attrs:''},
  repeater: {tag:'div',title:'',id:'',class:'repeater-container',style:'',state:'items',attrs:'',children:true},
  conditional:{tag:'div',title:'',id:'',class:'conditional-container',style:'',state:'show_condition',attrs:'',children:true},
  'data-table':{tag:'table',title:'Header1,Header2',id:'',class:'table table-striped',style:'',rows:'Row1Col1,Row1Col2\nRow2Col1,Row2Col2',state:'table_data',attrs:''},
  'json-viewer':{tag:'pre',title:'',id:'',class:'bg-light p-3 border',style:'',state:'json_data',attrs:''},
  toggle:   {tag:'input',title:'Power',id:'tog1',name:'tog1',class:'form-check-input',style:'',state:'0',action:'/toggle',socket:'',response:'',attrs:''},
  cmd:      {tag:'button',title:'Run Command',id:'cmd1',class:'btn btn-warning',style:'',action:'/cmd?command=on',socket:'',response:'',attrs:''},
  rgb:      {tag:'div',title:'RGB Color',id:'rgb1',class:'',style:'',action:'/setcolor',response:'',attrs:''},
  sensor:   {tag:'div',title:'Temperature',id:'sen1',class:'alert alert-info',style:'',state:'22°C',response:'temp',socket:'',attrs:''},
  knob:     {tag:'input',title:'Knob',id:'knob1',class:'knob-input',style:'',min:'0',max:'100',value:'50',attrs:'type="range"'},
  gauge:    {tag:'div',title:'Gauge',id:'gauge1',class:'gauge-container',style:'',state:'gauge_val',attrs:''},
  'log-display':{tag:'div',title:'',id:'log1',class:'bg-dark text-light p-3 font-monospace',style:'height:200px;overflow-y:auto',state:'logs',attrs:''},
  'notification-bell':{tag:'button',title:'🔔',id:'bell1',class:'btn btn-light position-relative',style:'',attrs:''},
  'star-rating':{tag:'div',title:'',id:'rating1',class:'star-rating-container',style:'',value:'4',attrs:''},
  'like-btn':{tag:'button',title:'👍 Like',id:'like1',class:'btn btn-outline-primary',style:'',attrs:''},
  'copy-btn':{tag:'button',title:'📋 Copy',id:'copyBtn1',class:'btn btn-sm btn-outline-secondary',style:'',attrs:''},
  'share-btn':{tag:'button',title:'🔗 Share',id:'shareBtn1',class:'btn btn-sm btn-outline-primary',style:'',attrs:''},
  'back-top':{tag:'button',title:'↑',id:'backTop1',class:'btn btn-primary rounded-circle position-fixed bottom-0 end-0 m-3',style:'',attrs:''},
  loader:   {tag:'div',title:'',id:'loader1',class:'spinner-border',style:'',attrs:''},
  'empty-state':{tag:'div',title:'No items found',id:'',class:'text-center p-5 border rounded bg-light',style:'',body:'Create your first item to get started.',attrs:''},
  'error-state':{tag:'div',title:'Error loading data',id:'',class:'alert alert-danger',style:'',body:'Please check your connection and try again.',attrs:''},
  'meta-block':{tag:'div',title:'Page Title',id:'',class:'d-none',style:'',body:'Meta description goes here.',attrs:'data-seo-meta="true"'},
  'schema-block':{tag:'script',title:'',id:'',class:'',style:'',body:'{\n  "@context": "https://schema.org",\n  "@type": "WebPage"\n}',attrs:'type="application/ld+json"'},
  canonical:{tag:'link',title:'',id:'',class:'',style:'',attrs:'rel="canonical" href="https://example.com"'},
  'og-block':{tag:'div',title:'OG Title',id:'',class:'d-none',style:'',body:'OG Description',attrs:'data-seo-og="true"'}
};

const COMP_ICONS = {};
PALETTE.forEach(p=>COMP_ICONS[p.type]=p.icon);

const COMP_COLORS = {
  layout:'#818cf8',text:'#34d399',form:'#fbbf24',media:'#f472b6',
  nav:'#60a5fa',data:'#fb923c',action:'#a78bfa',bs:'#7dd3fc',
  feedback:'#2dd4bf',seo:'#a8a29e'
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
    flexbox:['d-flex align-items-center justify-content-between', 'd-flex flex-column', 'd-flex align-items-center gap-2', 'd-flex justify-content-center', 'd-flex flex-wrap'],
    grid:['d-grid', 'd-grid gap-2', 'd-grid gap-3'],
    button:['btn btn-primary','btn btn-secondary','btn btn-success','btn btn-danger','btn btn-warning','btn btn-outline-primary','btn btn-lg btn-primary','btn btn-sm btn-secondary','btn btn-dark'],
    input:['form-control','form-control form-control-sm','form-control form-control-lg'],
    select:['form-select','form-select form-select-sm'],
    alert:['alert alert-primary','alert alert-secondary','alert alert-success','alert alert-danger','alert alert-warning','alert alert-info','alert alert-light','alert alert-dark'],
    badge:['badge bg-primary','badge bg-secondary','badge bg-success','badge bg-danger','badge bg-warning text-dark','badge bg-info text-dark','badge rounded-pill bg-primary'],
    card:['card','card border-primary','card shadow','card shadow-lg','card text-white bg-dark'],
    'card-header':['card-header', 'card-header bg-primary text-white', 'card-header bg-dark text-white'],
    'card-body':['card-body', 'card-body p-4', 'card-body text-center'],
    'card-footer':['card-footer', 'card-footer text-muted'],
    offcanvas:['offcanvas offcanvas-start bg-dark text-white', 'offcanvas offcanvas-end bg-dark text-white', 'offcanvas offcanvas-bottom bg-dark text-white'],
    table:['table','table table-striped','table table-bordered','table table-hover','table table-dark','table table-sm table-striped table-hover'],
    progress:['progress','progress bg-success','progress bg-info'],
    img:['img-fluid','img-thumbnail','img-fluid rounded','img-fluid rounded-circle','img-fluid shadow'],
    p:['','text-muted','lead','text-center','text-end','text-danger','fw-bold','fst-italic'],
    h1:['display-1','display-2','fw-bold','text-primary','text-center'],
    h2:['display-3','fw-bold','text-secondary','border-bottom pb-2'],
    h3:['fw-bold','text-muted','border-bottom'],
    ul:['list-group','list-unstyled'],
    'list-group':['list-group','list-group list-group-flush','list-group list-group-horizontal'],
    nav:['','nav nav-tabs','nav nav-pills','navbar-nav'],
    form:['','row g-3','needs-validation'],
    spinner:['spinner-border text-primary','spinner-border text-success','spinner-border text-danger','spinner-grow text-primary'],
    col:['col','col-12','col-md-6','col-md-4','col-lg-3','col-sm-12 col-md-6 col-lg-4'],
    pills:['nav nav-pills', 'nav nav-pills nav-fill', 'nav nav-pills flex-column'],
    jumbotron:['p-5 mb-4 bg-light rounded-3', 'p-5 mb-4 bg-dark text-white rounded-3 border border-secondary shadow-lg'],
    split:['row', 'row g-4'],
    stack:['vstack gap-3', 'hstack gap-3', 'vstack gap-2', 'hstack gap-2'],
    wrap:['d-flex flex-wrap gap-2', 'd-flex flex-wrap align-items-center gap-3'],
    details:['p-2 border rounded', 'p-3 bg-dark border-secondary rounded shadow-sm'],
    multiselect:['form-select', 'form-select form-select-sm', 'form-select form-select-lg'],
    picture:['ratio ratio-16x9', 'ratio ratio-4x3'],
    sidebar:['bg-dark text-white p-3', 'bg-body-tertiary border-end p-3'],
    stepper:['d-flex justify-content-between align-items-center', 'nav nav-pills stepper-nav'],
    menu:['list-unstyled mb-0', 'nav flex-column'],
    carousel:['carousel slide', 'carousel slide carousel-fade'],
    collapse:['collapse', 'collapse show'],
    'close-btn':['btn-close', 'btn-close btn-close-white'],
    'star-rating':['star-rating-container d-flex gap-1', 'star-rating-container fs-4'],
    'notification-bell':['btn btn-light position-relative', 'btn btn-outline-primary position-relative'],
    'meta-block':['d-none'],
    'og-block':['d-none']
  },
  style:{
    all:['','padding:16px','margin:8px 0','border:1px solid #dee2e6;padding:16px;border-radius:8px','background:#f8f9fa;padding:12px;border-radius:6px'],
    text:['','font-size:1.2rem','font-weight:bold','color:#6c757d','text-align:center'],
  },
  action:{all:['/action','/restart','/toggle','/set','/cmd?command=on','/cmd?command=off','/api/data']},
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
  const def = COMP_DEFAULTS[type] || COMP_DEFAULTS.div;
  const block = {
    _uid: uid(),           // internal render key
    cid: newCid(),         // stable component id, exported in JSON
    type,
    parentCid,
    comment: '',           // inline dev comment (visible in builder, exported in JSON)
    children: [],
    ...(JSON.parse(JSON.stringify(def)))
  };
  if(def.children === true){
    block.children = [];
  } else if(Array.isArray(def.children)){
    block.children = JSON.parse(JSON.stringify(def.children));
  } else {
    block.children = [];
  }
  return block;
}

/* ═══════════════════════════════════════════════════
   TREE PANEL TOGGLE
   ═══════════════════════════════════════════════════ */
function toggleTreePanel(){
  treeVisible = !treeVisible;
  document.getElementById('app').classList.toggle('tree-hidden', !treeVisible);
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
  const countEl = document.getElementById('palette-count');
  if(countEl) countEl.textContent = PALETTE.length + ' total';
  pal.querySelectorAll('.pal-item').forEach(el=>{
    el.addEventListener('dragstart',e=>{
      dragState.src = 'palette:'+el.dataset.type;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed='copy';
    });
    el.addEventListener('dragend',()=>el.classList.remove('dragging'));
    el.addEventListener('click',()=>addBlockAtEnd(el.dataset.type));
  });
}

function filterPalette() {
  const q = (document.getElementById('palette-search')?.value || '').toLowerCase();
  const pal = document.getElementById('palette');
  if (!pal) return;
  const items = pal.querySelectorAll('.pal-item');
  const labels = pal.querySelectorAll('.pal-group-label');
  
  items.forEach(item => {
    const name = (item.querySelector('.name')?.textContent || '').toLowerCase();
    const sub = (item.querySelector('.sub')?.textContent || '').toLowerCase();
    const tag = (item.querySelector('.tag')?.textContent || '').toLowerCase();
    const match = name.includes(q) || sub.includes(q) || tag.includes(q);
    item.style.display = match ? '' : 'none';
  });
  
  labels.forEach(lbl => {
    lbl.style.display = q ? 'none' : '';
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
function renderAll(){
  renderCanvas();
  renderTree();
}

/* ═══════════════════════════════════════════════════
   CANVAS RENDER
   ═══════════════════════════════════════════════════ */
function renderCanvas(){
  const canvas = document.getElementById('canvas');
  canvas.querySelectorAll('.block,.ch-empty').forEach(e=>e.remove());
  blocks.forEach(b=>canvas.appendChild(buildBlockEl(b)));
  const empty = document.getElementById('canvas-empty');
  empty.style.display = blocks.length ? 'none' : '';
  const n = countAll();
  const cinfo = document.getElementById('canvas-info');
  if(cinfo) cinfo.textContent = n+' component'+(n!==1?'s':'');
  document.getElementById('stat-blocks').textContent = n;
  const undoBtn = document.getElementById('undo-btn');
  const undoBtn2 = document.getElementById('undo-btn2');
  if(undoBtn) undoBtn.disabled = undoStack.length===0;
  if(undoBtn2) undoBtn2.disabled = undoStack.length===0;
  if(document.getElementById('json-drawer').classList.contains('open')) renderJsonOutput();
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
  });
  el.addEventListener('dragend',()=>{ el.classList.remove('dragging-block','over-top','over-bottom'); });
  el.addEventListener('dragover',e=>{
    e.preventDefault();e.stopPropagation();
    const r=el.getBoundingClientRect();
    el.classList.remove('over-top','over-bottom');
    el.classList.add(e.clientY<r.top+r.height/2?'over-top':'over-bottom');
  });
  el.addEventListener('dragleave',e=>{
    if(!el.contains(e.relatedTarget)) el.classList.remove('over-top','over-bottom');
  });
  el.addEventListener('drop',e=>{
    e.preventDefault();e.stopPropagation();
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
  cc.querySelectorAll('.block').forEach(e=>e.remove());
  const placeholder = cc.querySelector('.ch-empty');
  if(b.children && b.children.length){
    if(placeholder) placeholder.style.display='none';
    b.children.forEach(child=>cc.appendChild(buildBlockEl(child, 1)));
  } else {
    if(placeholder) placeholder.style.display='';
  }
  cc.addEventListener('dragover',e=>{ e.preventDefault();e.stopPropagation();cc.classList.add('over'); });
  cc.addEventListener('dragleave',e=>{ if(!cc.contains(e.relatedTarget)) cc.classList.remove('over'); });
  cc.addEventListener('drop',e=>{
    e.preventDefault();e.stopPropagation();
    cc.classList.remove('over');
    handleBlockDrop(null, false, b._uid);
  });
}

function handleBlockDrop(refUid, above, parentUid){
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

// Canvas root drop
document.getElementById('canvas').addEventListener('dragover',e=>{
  e.preventDefault();
  document.getElementById('canvas').classList.add('over');
});
document.getElementById('canvas').addEventListener('dragleave',e=>{
  if(!document.getElementById('canvas').contains(e.relatedTarget))
    document.getElementById('canvas').classList.remove('over');
});
document.getElementById('canvas').addEventListener('drop',e=>{
  e.preventDefault();
  document.getElementById('canvas').classList.remove('over');
  if(!e.target.closest('.block')) handleBlockDrop(null,false,null);
});

/* ═══════════════════════════════════════════════════
   COMPONENT TREE PANEL
   ═══════════════════════════════════════════════════ */
let treeDragUid = null;
let treeDropTarget = null;

function renderTree(){
  const body = document.getElementById('tree-body');
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
  document.getElementById('ep-placeholder').style.display='';
  document.getElementById('ep-content').style.display='none';
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
  if (['h1','h2','h3','h4','h5','h6','p','span','label','strong','em','small','mark','abbr','kbd','del','sub','sup','time','address','cite','dfn','samp','var','bdi','legend','output','a','button','submit','reset','badge','alert','sensor','cmd','toggle','close-btn','like-btn','copy-btn','share-btn','back-top','notification-bell','meta-block','og-block','empty-state','error-state','jumbotron','navbar','card','modal'].includes(t)) {
    html += field('title','Text / Label', 'text', PRESETS.title?.[t]||[]);
  }
  if (['card','modal','empty-state','error-state','meta-block','schema-block','og-block','jumbotron','svg'].includes(t)) {
    html += field('body', t === 'schema-block' || t === 'svg' ? 'Content (JSON / SVG XML)' : 'Body Text', t === 'schema-block' || t === 'svg' ? 'textarea' : 'text');
  }
  if (['img','video','audio','iframe','figure','object-el','embed-el','source'].includes(t)) {
    html += field('src','Source URL / File');
    if (t === 'img' || t === 'figure') {
      html += field('alt','Alt Text');
    }
    if (t === 'figure') {
      html += field('caption','Caption');
    }
  }
  if (t === 'a' || t === 'canonical') {
    html += field('href', 'Href Link', 'text', PRESETS.href);
    if (t === 'a') {
      html += selectField('target', 'Target Window', PRESETS.target);
    }
  }
  if (['input','search','tel','email','url','password','hidden'].includes(t)) {
    html += field('placeholder','Placeholder');
    html += field('value','Default Value');
    if (t === 'input') {
      html += selectField('type','Input Type',PRESETS.type_input);
    }
  }
  if (['number','range','knob','progress-el','meter'].includes(t)) {
    html += field('min','Min Value');
    html += field('max','Max Value');
    html += field('step','Step Value');
    html += field('value','Current Value');
  }
  if (t === 'textarea') {
    html += field('rows','Rows','number');
    html += field('placeholder','Placeholder');
    html += field('value','Default Value');
  }
  if (['select','multiselect','datalist','dropdown','list-group','tabs','pills','breadcrumb','pagination','accordion'].includes(t)) {
    html += field('options','Options (comma separated)','text');
  }
  if (['checkbox','radio','switch','toggle'].includes(t)) {
    html += field('value','Value');
    html += checkField('checked','Checked by default');
  }
  if (t === 'form') {
    html += field('action','Form Action URL');
    html += selectField('method','HTTP Method',PRESETS.method);
  }
  if (t === 'table' || t === 'data-table') {
    html += field('title','Table Headers (comma separated)','text');
    html += field('rows','Table Rows (comma-sep columns, newline-sep rows)','textarea');
  }
  if (t === 'progress') {
    html += sliderField('value','Progress %',0,100);
  }
  if (t === 'alert') {
    html += checkField('dismissible','Dismissible Alert');
  }
  if (t === 'tooltip') {
    html += field('bs_title','Tooltip Text');
    html += selectField('bs_placement','Tooltip Placement',['top','bottom','left','right']);
  }
  if (['loadJson','template','socket','chart','repeater','conditional','json-viewer','log-display','gauge','sensor'].includes(t)) {
    html += field('state','Data State Key / File / URL','text');
    if (t === 'loadJson') {
      html += field('refresh','Auto-refresh Interval (ms)');
    }
  }
  if (['action','cmd','toggle','sensor','rgb','socket','template'].includes(t) || COMP_DEFAULTS[t]?.action !== undefined) {
    html += field('action','Action Endpoint / Command', 'text', PRESETS.action?.all||[]);
  }
  if (COMP_DEFAULTS[t]?.socket !== undefined) {
    html += field('socket','WebSocket URL');
  }
  if (COMP_DEFAULTS[t]?.response !== undefined) {
    html += field('response','Response JSON Path Mapping');
  }

  html += `<div class="ep-section">Styling</div>`;
  const preC = allPre[t]||allPre['div']||[];
  html += field('class','CSS class','text',preC.length?preC:PRESETS.class['div']||[]);
  html += field('style','Inline style','text',PRESETS.style.all);
  html += `<div class="ep-section">Identity</div>`;
  html += `<div class="ep-row2">${field('id','id')}${field('name','name')}</div>`;
  html += field('attrs','Extra HTML attrs','text',['data-bs-toggle="modal"','data-bs-target="#myModal"','role="button"']);
  html += `<div class="ep-section">Layout</div>`;
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

function renderPreview(b){
  const area = document.getElementById('ep-preview-area');
  if(!area) return;
  const style = buildInlineStyle(b);
  const cls = b.class||'';
  const t = b.type;
  let html = '';
  try{
    if(['h1','h2','h3','h4','h5','h6'].includes(t)) html=`<${t} class="${cls}" style="${style}">${b.title || t.toUpperCase()}</${t}>`;
    else if(['p','span','strong','em','small','mark','kbd','del','sub','sup','cite','dfn','samp','var','bdi','legend','output'].includes(t)) {
      html=`<${t} class="${cls}" style="${style}">${b.title || (t === 'kbd' ? 'Ctrl+S' : 'Text')}</${t}>`;
    }
    else if(t==='abbr') html=`<abbr class="${cls}" style="${style}" title="${b.attrs || 'Explanation'}">${b.title || 'Abbr'}</abbr>`;
    else if(t==='blockquote') html=`<blockquote class="${cls} blockquote" style="${style}">${b.title || 'Quote'}</blockquote>`;
    else if(t==='address') html=`<address class="${cls}" style="${style}">${b.title || '123 Main St'}</address>`;
    else if(t==='time') html=`<time class="${cls}" style="${style}">${b.title || '12:00 PM'}</time>`;
    else if(t==='button'||t==='submit'||t==='reset'||t==='like-btn'||t==='copy-btn'||t==='share-btn'||t==='back-top') {
      html=`<button class="${cls}" style="${style}" type="button">${b.title || t.replace('-',' ').toUpperCase()}</button>`;
    }
    else if(t==='close-btn') html=`<button class="btn-close ${cls}" style="${style}"></button>`;
    else if(t==='notification-bell') html=`<button class="btn btn-light position-relative ${cls}" style="${style}">${b.title || '🔔'}<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">3</span></button>`;
    else if(['input','search','tel','email','url','password','hidden'].includes(t)) {
      html=`<input class="${cls}" style="${style}" type="${t==='password'?'password':t==='hidden'?'hidden':'text'}" placeholder="${b.placeholder||b.title||t}">`;
    }
    else if(t==='textarea') html=`<textarea class="${cls}" style="${style};max-height:80px" rows="${b.rows||2}" placeholder="${b.placeholder||''}">${b.value||''}</textarea>`;
    else if(t==='select'||t==='multiselect'||t==='datalist') {
      const opts = (b.options||'').split(',').map(o=>`<option>${o.trim()}</option>`).join('');
      html=`<select class="${cls}" style="${style}" ${t==='multiselect'?'multiple':''}>${opts || '<option>Select option</option>'}</select>`;
    }
    else if(t==='checkbox'||t==='switch'||t==='radio'||t==='toggle') {
      html=`<div class="form-check form-switch"><input class="${cls}" type="${t==='radio'?'radio':'checkbox'}" style="${style}" ${b.checked?'checked':''} ${t==='toggle'&&b.state==='1'?'checked':''}><label class="form-check-label">${b.title||t}</label></div>`;
    }
    else if(t==='range'||t==='knob') {
      html=`<div class="${cls}" style="${style}"><label style="font-size:11px;display:block">${b.title||t}: <strong>${b.value||50}</strong></label><input type="range" class="form-range" min="${b.min||0}" max="${b.max||100}" value="${b.value||50}"></div>`;
    }
    else if(t==='color') html=`<input type="color" class="form-control form-control-color ${cls}" style="${style}" value="${b.value||'#3b82f6'}">`;
    else if(['date','datetime','week','month','number'].includes(t)) {
      html=`<input type="${t==='datetime'?'datetime-local':t}" class="form-control ${cls}" style="${style}" value="${b.value||''}">`;
    }
    else if(t==='meter') html=`<meter class="${cls}" style="${style}" min="${b.min||0}" max="${b.max||100}" value="${b.value||60}"></meter>`;
    else if(t==='progress-el') html=`<progress class="w-100 ${cls}" style="${style}" max="${b.max||100}" value="${b.value||70}"></progress>`;
    else if(t==='img'||t==='picture'||t==='figure'||t==='object-el'||t==='embed-el'||t==='source') {
      html=`<img class="${cls}" src="${b.src || 'https://picsum.photos/150/100'}" alt="${b.alt||b.title||''}" style="${style};max-height:80px;background:#222;min-width:60px">`;
    }
    else if(t==='svg') html=`<div class="${cls}" style="${style};width:40px;height:40px;color:var(--accent)">${b.body || '<svg viewBox="0 0 16 16" fill="currentColor" class="w-100 h-100"><circle cx="8" cy="8" r="8"/></svg>'}</div>`;
    else if(t==='canvas-el') html=`<canvas class="${cls} border" style="${style};width:120px;height:60px"></canvas>`;
    else if(t==='iframe') html=`<div class="${cls} text-muted border p-2 text-center" style="${style};font-size:10px;background:#111">iFrame: ${b.src || 'empty'}</div>`;
    else if(t==='alert') html=`<div class="${cls}" style="${style};font-size:11px" role="alert">${b.title||'Alert Message'}${b.dismissible?'<button type="button" class="btn-close float-end" style="font-size:8px"></button>':''}</div>`;
    else if(t==='badge') html=`<span class="${cls}" style="${style}">${b.title||'Badge'}</span>`;
    else if(t==='progress') html=`<div class="progress" style="${style};width:100%"><div class="progress-bar" style="width:${b.value||75}%">${b.value||75}%</div></div>`;
    else if(t==='spinner'||t==='loader') html=`<div class="spinner-border ${cls}" style="${style}" role="status"><span class="visually-hidden">Loading...</span></div>`;
    else if(t==='placeholder') html=`<span class="placeholder col-6 ${cls}" style="${style}"></span>`;
    else if(t==='toast') html=`<div class="toast show ${cls}" style="${style};font-size:10px"><div class="toast-header" style="padding:2px 8px">Toast Title</div><div class="toast-body" style="padding:4px 8px">${b.title||'Body text'}</div></div>`;
    else if(t==='popover') html=`<button type="button" class="btn btn-sm btn-secondary ${cls}" style="${style}">Popover Toggle</button>`;
    else if(t==='tooltip') html=`<span class="badge bg-secondary ${cls}" style="${style}">${b.title||'Hover me'}</span>`;
    else if(t==='hr'||t==='divider-bs') html=`<hr class="${cls}" style="${style}">`;
    else if(t==='code') html=`<code class="${cls}" style="${style}">${b.title||'code'}</code>`;
    else if(t==='pre'||t==='json-viewer'||t==='log-display') html=`<pre class="${cls}" style="${style};max-height:80px;overflow:auto;font-size:10px;background:#111;padding:4px">${b.title||b.body||(t==='json-viewer'?'{ "json": true }':'Logs')}</pre>`;
    else if(t==='list-group') html=`<ul class="${cls}" style="${style}">${(b.title||'Item 1,Item 2').split(',').map(i=>`<li class="list-group-item" style="font-size:11px;padding:3px 8px">${i.trim()}</li>`).join('')}</ul>`;
    else if(t==='dropdown') html=`<div class="dropdown"><button class="btn btn-secondary dropdown-toggle btn-sm" type="button">${b.title||'Dropdown'}</button></div>`;
    else if(t==='navbar') html=`<nav class="navbar navbar-dark bg-dark" style="padding:2px 8px;border-radius:4px;width:100%"><a class="navbar-brand" style="font-size:11px">${b.title||'Brand'}</a></nav>`;
    else if(t==='breadcrumb') html=`<nav><ol class="breadcrumb" style="font-size:10px;margin:0">${(b.title||'Home,Page').split(',').map((v,i,a)=>`<li class="breadcrumb-item${i===a.length-1?' active':''}">${v.trim()}</li>`).join('')}</ol></nav>`;
    else if(t==='tabs'||t==='pills') html=`<ul class="nav ${t==='tabs'?'nav-tabs':'nav-pills'}" style="font-size:10px">${(b.title||'Tab 1,Tab 2').split(',').map((v,i)=>`<li class="nav-item"><a class="nav-link${i===0?' active':''}">${v.trim()}</a></li>`).join('')}</ul>`;
    else if(t==='sensor'||t==='gauge') html=`<div class="${cls} text-center p-2 border border-info rounded" style="${style};font-size:11px;background:rgba(6,182,212,0.05)">${b.title||'Sensor'}: <strong class="text-info">${b.state||'—'}</strong></div>`;
    else if(t==='cmd') html=`<button class="${cls}" style="${style}">${b.title||'Command'}</button>`;
    else if(t==='table'||t==='data-table'){
      const hdrs=(b.title||'A,B').split(',');
      const rows=(b.rows||'Val1,Val2').split('\n').filter(Boolean);
      html=`<table class="table table-sm table-bordered ${cls}" style="${style};font-size:9px;margin:0"><thead><tr>${hdrs.map(h=>`<th>${h.trim()}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.split(',').map(c=>`<td>${c.trim()}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    else if(t==='loadJson'||t==='template') html=`<div class="${cls}" style="${style};background:rgba(16,185,129,0.06);padding:6px;border-radius:4px;font-size:10px;color:#34d399;border:1px solid rgba(16,185,129,0.15)"><i class="bi bi-file-earmark-code"></i> ${b.state||'?.json'}</div>`;
    else if(t==='repeater'||t==='conditional') html=`<div class="${cls} text-muted border border-secondary p-2 text-center" style="${style};font-size:10px;background:rgba(255,255,255,0.01);border-style:dashed">&lt;${t}&gt; loops state: ${b.state}</div>`;
    else if(['meta-block','schema-block','canonical','og-block'].includes(t)) {
      html=`<div class="text-muted border p-2 text-center" style="font-size:10px;background:#1a1010;width:100%"><i class="bi bi-search"></i> SEO: &lt;${t}&gt;</div>`;
    }
    else if(t==='star-rating') {
      const v = parseInt(b.value) || 4;
      let stars = '';
      for (let i = 1; i <= 5; i++) stars += `<i class="bi bi-star${i<=v?'-fill':''}" style="color:#fbbf24;margin-right:2px"></i>`;
      html=`<div class="${cls}" style="${style}">${stars}</div>`;
    }
    else if(t==='empty-state'||t==='error-state') {
      html=`<div class="text-center p-3 border rounded ${t==='error-state'?'bg-danger-subtle text-danger border-danger':'bg-body-tertiary border-secondary text-muted'}" style="${style};font-size:10px;width:100%"><h6>${b.title}</h6><p class="mb-0">${b.body||''}</p></div>`;
    }
    else if(['div','container','container-fluid','row','col','section','article','aside','header','footer','main','nav','form','ul','ol','split','stack','wrap','details','sidebar','stepper','menu','button-group','input-group','fieldset','card-header','card-body','card-footer','accordion','modal','offcanvas','jumbotron'].includes(t)) {
      html=`<div class="${cls}" style="background:rgba(255,255,255,.02);border:1px dashed var(--panel-border);border-radius:4px;padding:8px;font-size:10.5px;color:var(--muted);width:100%">&lt;${t}&gt; container</div>`;
    }
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
    // Always include cid first
    const out={ cid: b.cid, type: b.type };
    // Include comment if set
    if(b.comment) out.comment = b.comment;
    for(const [k,v] of Object.entries(b)){
      if(skip.includes(k)) continue;
      if(k==='cid'||k==='type'||k==='comment') continue; // already added
      if(v===''||v===undefined||v===null||v===false) continue;
      if(k.startsWith('_')) continue;
      out[k]=v;
    }
    let cs=buildInlineStyle(b);
    if(cs) out.style=cs; else delete out.style;
    if(b.children&&b.children.length) out.children=b.children.map(serializeBlock);
    return out;
  }
  return {content: blocks.map(serializeBlock)};
}

function renderJsonOutput(){
  const out = buildJson();
  const str = jsonPretty ? JSON.stringify(out,null,2) : JSON.stringify(out);
  document.getElementById('json-output').textContent = str;
}

function toggleJsonDrawer(){
  const d = document.getElementById('json-drawer');
  d.classList.toggle('open');
  if(d.classList.contains('open')) renderJsonOutput();
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
function pushUndo(){ undoStack.push(JSON.stringify(blocks)); if(undoStack.length>30) undoStack.shift(); }
function undoLast(){
  if(!undoStack.length) return;
  const state = undoStack.pop();
  blocks = JSON.parse(state);
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
    await handleUrlParams();
  }catch(e){ toast('DB error: '+e.message,'error'); }
}

async function handleUrlParams(){
  const search = window.location.search;
  let fileName = '';
  
  if (search) {
    const params = new URLSearchParams(search);
    for (const [key, value] of params.entries()) {
      if (key.endsWith('.json')) {
        fileName = key;
        break;
      }
      if (value.endsWith('.json')) {
        fileName = value;
        break;
      }
    }
    if (!fileName) {
      const rawQuery = search.substring(1);
      if (rawQuery.endsWith('.json')) {
        fileName = rawQuery;
      }
    }
  }
  
  if (!fileName) {
    fileName = 'index.json';
  }
  
  try {
    const exists = await webdb.exists(`${DB_NAME}/${fileName}`);
    if (exists) {
      await loadFile(fileName);
    } else {
      if (fileName === 'index.json') {
        await createDefaultIndexJson();
      } else {
        await createStarterJson(fileName);
      }
      await loadFileList();
      await loadFile(fileName);
    }
  } catch (error) {
    console.error('URL Loader Error:', error);
  }
}

async function createDefaultIndexJson() {
  const defaultPage = {
    content: [
      {
        cid: "cid_0001",
        type: "container",
        class: "container py-5",
        children: [
          {
            cid: "cid_0002",
            type: "jumbotron",
            class: "p-5 mb-4 bg-dark text-white rounded-3 border border-secondary shadow",
            title: "Welcome to JSON UI Builder",
            body: "This is a premium JSON UI Builder layout. Customize this page or drag and drop new components directly from the left sidebar!",
            children: [
              {
                cid: "cid_0003",
                type: "h1",
                class: "display-4 fw-bold text-info",
                title: "Build Responsive UIs Instantly"
              },
              {
                cid: "cid_0004",
                type: "p",
                class: "lead text-muted mb-4",
                title: "Create complex, state-of-the-art landing pages in minutes using Bootstrap 5 and JSON specs."
              },
              {
                cid: "cid_0005",
                type: "button",
                class: "btn btn-cyan btn-lg px-4 me-md-2",
                title: "Explore Components"
              }
            ]
          },
          {
            cid: "cid_0006",
            type: "row",
            class: "row g-4 py-5",
            children: [
              {
                cid: "cid_0007",
                type: "col",
                class: "col-md-4",
                children: [
                  {
                    cid: "cid_0008",
                    type: "card",
                    class: "card h-100 shadow-sm bg-dark text-white border-secondary",
                    title: "IndexedDB Storage",
                    body: "All pages are saved locally to WebDB. Open files from the dropdown or load them via index.html?my-page.json."
                  }
                ]
              },
              {
                cid: "cid_0009",
                type: "col",
                class: "col-md-4",
                children: [
                  {
                    cid: "cid_0010",
                    type: "card",
                    class: "card h-100 shadow-sm bg-dark text-white border-secondary",
                    title: "Accordion & Tabs",
                    body: "Supports nesting inside rows, columns, tabs, modals, card bodies, and details. Expand items on the Component Tree!"
                  }
                ]
              },
              {
                cid: "cid_0011",
                type: "col",
                class: "col-md-4",
                children: [
                  {
                    cid: "cid_0012",
                    type: "card",
                    class: "card h-100 shadow-sm bg-dark text-white border-secondary",
                    title: "Live Preview",
                    body: "Double-check layout, attributes, and styles immediately in the property sidebar before exporting your final JSON."
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
  await webdb.upsert(`${DB_NAME}/index.json`, defaultPage);
}

async function createStarterJson(fileName) {
  const starterPage = {
    content: [
      {
        cid: "cid_0001",
        type: "container",
        class: "container py-5",
        children: [
          {
            cid: "cid_0002",
            type: "h1",
            class: "display-5 fw-bold text-primary",
            title: `New Page: ${fileName}`
          },
          {
            cid: "cid_0003",
            type: "p",
            class: "lead text-muted",
            title: "This is a clean template page. Drag components here to start designing."
          }
        ]
      }
    ]
  };
  await webdb.upsert(`${DB_NAME}/${fileName}`, starterPage);
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
    const statFile = document.getElementById('stat-file');
    if(statFile) statFile.textContent = name;
    const statSaved = document.getElementById('stat-saved');
    if(statSaved) statSaved.textContent = 'saved '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    const statDot = document.getElementById('stat-dot');
    if(statDot) statDot.classList.add('saved');
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
      // restore counters
      idCounter = Math.max(idCounter, ...getAllIds(blocks))+1;
      cidCounter = Math.max(cidCounter, ...getAllCids(blocks))+1;
      currentFile = name;
      selectedId = null;
      closeEditor();
      renderAll();
      const sf = document.getElementById('stat-file');
      if(sf) sf.textContent = name;
      const ss = document.getElementById('stat-saved');
      if(ss) ss.textContent = 'loaded';
      const sd = document.getElementById('stat-dot');
      if(sd) sd.classList.add('saved');
      document.getElementById('file-selector').value = name;
      toast('Loaded: '+name,'success');
    } else { toast('Invalid file format','error'); }
  }catch(e){ toast('Load error: '+e.message,'error'); }
}

function inflateBlock(raw){
  const b = {
    _uid: uid(),
    cid: raw.cid || newCid(),
    type: raw.type||'div',
    parentCid: null,
    comment: raw.comment||'',
    children: []
  };
  Object.assign(b, raw);
  b._uid = uid(); // force fresh _uid
  if(raw.children&&Array.isArray(raw.children)){
    b.children = raw.children.map(c=>inflateBlock(c));
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
function previewPage(){
  const json = buildJson();
  const html = generatePreviewHTML(json.content||[]);
  const iframe = document.getElementById('preview-iframe');
  iframe.srcdoc = html;
  new bootstrap.Modal(document.getElementById('previewModal')).show();
}

function generatePreviewHTML(content){
  function renderEl(b){
    const def = COMP_DEFAULTS[b.type]||{};
    const tag = def.tag||b.type||'div';
    const style = buildInlineStyle(b);
    const cls = b.class||'';
    const id = b.id?`id="${b.id}"`:'';
    const extraAttrs = b.attrs||'';
    const children = b.children&&b.children.length ? b.children.map(renderEl).join('') : (b.body||'');
    
    if(tag==='hr'||tag==='input'||tag==='img'||tag==='br'||tag==='source'||tag==='embed'||tag==='link'){
      if(tag==='input'){
        const t=b.type==='checkbox'||b.type==='radio'||b.type==='switch'?'checkbox':b.type==='range'?'range':b.type==='submit'?'submit':b.type==='reset'?'reset':'text';
        return `<input ${id} class="${cls}" type="${t}" style="${style}" placeholder="${b.placeholder||''}" value="${b.value||''}" ${b.checked?'checked':''} ${extraAttrs}>`;
      }
      if(tag==='img') return `<img ${id} class="${cls}" src="${b.src||''}" alt="${b.alt||''}" style="${style}" ${extraAttrs}>`;
      if(tag==='source') return `<source src="${b.src||''}" ${extraAttrs}>`;
      if(tag==='embed') return `<embed ${id} class="${cls}" src="${b.src||''}" style="${style}" ${extraAttrs}>`;
      if(tag==='link') return `<link ${extraAttrs}>`;
      return `<${tag} ${id} class="${cls}" style="${style}" ${extraAttrs}>`;
    }
    
    const innerText = b.title||b.value||'';
    let inner='';
    const t=b.type;
    
    if(t==='card') {
      if (children) {
        inner = children;
      } else {
        inner=`<div class="card-body"><h5 class="card-title">${b.title||'Title'}</h5><p class="card-text">${b.body||''}</p></div>`;
      }
    }
    else if(t==='jumbotron') {
      if (children) {
        inner = children;
      } else {
        inner=`<h1 class="display-4">${b.title||'Hello!'}</h1><p class="lead">${b.body||''}</p>`;
      }
    }
    else if(t==='table'||t==='data-table'){
      const hdrs=(b.title||'').split(',');
      const rows=(b.rows||'').split('\n').filter(Boolean);
      inner=`<thead><tr>${hdrs.map(h=>`<th>${h.trim()}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.split(',').map(c=>`<td>${c.trim()}</td>`).join('')}</tr>`).join('')}</tbody>`;
    }
    else if(t==='select'||t==='multiselect') {
      inner=(b.options||'').split(',').map(o=>`<option>${o.trim()}</option>`).join('');
    }
    else if(t==='datalist') {
      inner=(b.options||'').split(',').map(o=>`<option value="${o.trim()}">`).join('');
    }
    else if(t==='progress') inner=`<div class="progress-bar" style="width:${b.value||0}%">${b.value||0}%</div>`;
    else if(t==='spinner'||t==='loader') inner=`<span class="visually-hidden">${b.title||'Loading...'}</span>`;
    else if(t==='alert') inner=innerText+(b.dismissible?'<button type="button" class="btn-close float-end" data-bs-dismiss="alert"></button>':'');
    else if(t==='list-group') inner=(b.title||'').split(',').map(v=>`<li class="list-group-item">${v.trim()}</li>`).join('');
    else if(t==='dropdown') inner=`<button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">${b.title||'Dropdown'}</button><ul class="dropdown-menu">${(b.options||'').split(',').map(o=>o.trim()==='Divider'?'<li><hr class="dropdown-divider"></li>':`<li><a class="dropdown-item" href="#">${o.trim()}</a></li>`).join('')}</ul>`;
    else if(t==='navbar') inner=`<a class="navbar-brand" href="#">${b.title||'Brand'}</a><button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nb${b.id}"><span class="navbar-toggler-icon"></span></button><div class="collapse navbar-collapse" id="nb${b.id}"></div>`;
    else if(t==='breadcrumb') inner=`<ol class="breadcrumb">${(b.title||'').split(',').map((v,i,a)=>`<li class="breadcrumb-item${i===a.length-1?' active':''}">${i===a.length-1?v.trim():`<a href="#">${v.trim()}</a>`}</li>`).join('')}</ol>`;
    else if(t==='pagination') inner=`<ul class="pagination">${(b.title||'').split(',').map(v=>`<li class="page-item"><a class="page-link" href="#">${v.trim()}</a></li>`).join('')}</ul>`;
    else if(t==='tabs'||t==='pills') inner=(b.title||'').split(',').map((v,i)=>`<li class="nav-item"><a class="nav-link${i===0?' active':''}" href="#">${v.trim()}</a></li>`).join('');
    else if(t==='accordion'){
      inner=(b.title||'Item').split(',').map((v,i)=>`<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button${i>0?' collapsed':''}" type="button" data-bs-toggle="collapse" data-bs-target="#acc_${b.cid}_${i}">${v.trim()}</button></h2><div id="acc_${b.cid}_${i}" class="accordion-collapse collapse${i===0?' show':''}"><div class="accordion-body">Content for ${v.trim()}</div></div></div>`).join('');
    }
    else if(t==='carousel') {
      const images = (b.options || 'https://picsum.photos/800/400?sig=1,https://picsum.photos/800/400?sig=2').split(',');
      const cid = b.id || b.cid;
      inner = `<div class="carousel-indicators">${images.map((img, i) => `<button type="button" data-bs-target="#${cid}" data-bs-slide-to="${i}" class="${i===0?'active':''}"></button>`).join('')}</div>`;
      inner += `<div class="carousel-inner">${images.map((img, i) => `<div class="carousel-item ${i===0?'active':''}"><img src="${img.trim()}" class="d-block w-100" alt="Slide ${i+1}"></div>`).join('')}</div>`;
      inner += `<button class="carousel-control-prev" type="button" data-bs-target="#${cid}" data-bs-slide="prev"><span class="carousel-control-prev-icon"></span></button>`;
      inner += `<button class="carousel-control-next" type="button" data-bs-target="#${cid}" data-bs-slide="next"><span class="carousel-control-next-icon"></span></button>`;
    }
    else if(t==='modal') inner=`<div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">${b.title||'Modal'}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">${b.body||''}</div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div></div></div>`;
    else if(t==='figure') inner=`<img src="${b.src||''}" class="figure-img img-fluid" alt=""><figcaption class="figure-caption">${b.caption||''}</figcaption>`;
    else if(t==='video'||t==='audio') inner='';
    else if(t==='checkbox'||t==='radio'||t==='switch'){
      return `<div class="form-check${t==='switch'?' form-switch':''}"><input class="${cls}" type="${t==='radio'?'radio':'checkbox'}" ${id} name="${b.name||''}" value="${b.value||''}" ${b.checked?'checked':''} style="${style}" ${extraAttrs}><label class="form-check-label" ${b.id?`for="${b.id}"`:''} >${b.title||''}</label></div>`;
    }
    else if(t==='sensor'||t==='gauge') inner=`<span>${b.title||'Value'}: <strong id="${b.response||'val'}">${b.state||'—'}</strong></span>`;
    else if(t==='toggle') return `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" ${id} ${b.state==='1'?'checked':''} ${extraAttrs}><label class="form-check-label">${b.title||'Toggle'}</label></div>`;
    else if(t==='loadJson'||t==='template') inner=`<div data-src="${b.state||''}" data-refresh="${b.refresh||''}">[JSON: ${b.state||''}] ${children}</div>`;
    else if(t==='repeater'||t==='conditional') inner=`<div data-state="${b.state||''}">[${t.toUpperCase()} State: ${b.state||''}] ${children}</div>`;
    else if(t==='knob') return `<input ${id} class="${cls}" type="range" min="${b.min||0}" max="${b.max||100}" value="${b.value||50}" style="${style}" ${extraAttrs}>`;
    else if(t==='star-rating') {
      const v = parseInt(b.value) || 4;
      let stars = '';
      for (let i = 1; i <= 5; i++) stars += `<i class="bi bi-star${i<=v?'-fill':''}" style="color:#fbbf24;margin-right:2px"></i>`;
      return `<div ${id} class="${cls}" style="${style}" ${extraAttrs}>${stars}</div>`;
    }
    else if(t==='like-btn') return `<button ${id} class="${cls}" style="${style}" type="button" ${extraAttrs}><i class="bi bi-hand-thumbs-up-fill me-1"></i> ${b.title || 'Like'}</button>`;
    else if(t==='copy-btn') return `<button ${id} class="${cls}" style="${style}" type="button" onclick="navigator.clipboard.writeText('${b.value||''}')" ${extraAttrs}><i class="bi bi-clipboard me-1"></i> ${b.title || 'Copy'}</button>`;
    else if(t==='share-btn') return `<button ${id} class="${cls}" style="${style}" type="button" ${extraAttrs}><i class="bi bi-share me-1"></i> ${b.title || 'Share'}</button>`;
    else if(t==='back-top') return `<button ${id} class="${cls}" style="${style}" type="button" onclick="window.scrollTo({top:0,behavior:'smooth'})" ${extraAttrs}>${b.title || '↑'}</button>`;
    else if(t==='empty-state') return `<div ${id} class="${cls} text-center p-5 border rounded bg-light" style="${style}" ${extraAttrs}><i class="bi bi-inbox display-4 text-muted d-block mb-3"></i><h4>${b.title}</h4><p class="text-muted mb-0">${b.body||''}</p></div>`;
    else if(t==='error-state') return `<div ${id} class="alert alert-danger text-center p-5 ${cls}" style="${style}" ${extraAttrs}><i class="bi bi-exclamation-triangle display-4 d-block mb-3"></i><h4>${b.title}</h4><p class="mb-0">${b.body||''}</p></div>`;
    else if(t==='schema-block') return `<script type="application/ld+json">${b.body || '{}'}</script>`;
    else if(t==='meta-block') return `<meta name="description" content="${b.body || ''}">`;
    else if(t==='og-block') return `<meta property="og:title" content="${b.title || ''}"><meta property="og:description" content="${b.body || ''}">`;
    else if(t==='svg') return `<svg ${id} class="${cls}" style="${style}" ${extraAttrs}>${b.body || ''}</svg>`;
    else if(children) inner=children;
    else inner=innerText;
    
    let attrs=`${id} class="${cls}" style="${style}" data-cid="${b.cid}"`;
    if(tag==='a') attrs+=` href="${b.href||'#'}" target="${b.target||''}"`;
    if(tag==='form') attrs+=` action="${b.action||''}" method="${b.method||'GET'}"`;
    if(tag==='video'||tag==='audio') attrs+=` src="${b.src||''}" ${b.controls?'controls':''} ${b.autoplay?'autoplay':''}`;
    if(tag==='iframe') attrs+=` src="${b.src||''}"`;
    if(b.role) attrs+=` role="${b.role}"`;
    if(b['data-bs-toggle']||b.bs_toggle) attrs+=` data-bs-toggle="${b['data-bs-toggle']||b.bs_toggle||''}"`;
    if(b.bs_placement) attrs+=` data-bs-placement="${b.bs_placement}"`;
    if(b.bs_title) attrs+=` title="${b.bs_title}"`;
    if(extraAttrs) attrs+=' '+extraAttrs;
    return `<${tag} ${attrs}>${inner}</${tag}>`;
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"><link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet"></head><body class="p-4">${content.map(renderEl).join('\n')}<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"><\/script></body></html>`;
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
  if(e.target.matches('input,textarea,select')) return;
  if(e.key==='Delete'&&selectedId){ deleteBlock(selectedId); }
  if(e.key==='Escape'&&selectedId){ selectedId=null; closeEditor(); }
  if(e.ctrlKey&&e.key==='z'){ e.preventDefault(); undoLast(); }
  if(e.ctrlKey&&e.key==='s'){ e.preventDefault(); showSaveModal(); }
  if(e.ctrlKey&&e.key==='j'){ e.preventDefault(); toggleJsonDrawer(); }
  if(e.ctrlKey&&e.key==='t'){ e.preventDefault(); toggleTreePanel(); }
});

/* ═══════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════ */
renderPalette();
// Start with tree panel hidden - user can open with Ctrl+T or the Tree button
treeVisible = false;
document.getElementById('app').classList.add('tree-hidden');
renderAll();
initDB();
