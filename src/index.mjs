import MarkdownIt from 'markdown-it';
import { parse } from 'yaml';
const md = new MarkdownIt({html:false,linkify:true});
const escape=md.utils.escapeHtml;
const safeUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}};
const validId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const normalize = value => String(value).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/đ/g,'d').trim();
import {compileStructure} from './structure.mjs';
export function compileWiki(records,config={}) {
  const articles = new Map(), aliases = new Map(), diagnostics = [], categories = new Map(), backlinks = new Map();
  for (const {path,text} of records) {
    const match = text.replace(/\r\n/g,'\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) throw Error('Missing frontmatter: '+path);
    const data = parse(match[1]);
    if (!data || data.schema !== 1 || typeof data.id !== 'string' || !validId.test(data.id) || typeof data.title !== 'string' || !data.title.trim()) throw Error('Invalid article: '+path);
    if (articles.has(data.id)) throw Error('Duplicate ID: '+data.id);
    for (const key of ['aliases','categories']) if (data[key] !== undefined && (!Array.isArray(data[key]) || data[key].some(x=>typeof x!=='string'))) throw Error('Invalid '+key+': '+path);
    if(data.infobox!==undefined && (!Array.isArray(data.infobox)||data.infobox.some(x=>!x||typeof x.label!=='string'||typeof x.value!=='string')))throw Error('Invalid infobox: '+path);
    if(data.references!==undefined && (!data.references||typeof data.references!=='object'||Array.isArray(data.references)||Object.entries(data.references).some(([key,x])=>!validId.test(key)||!x||typeof x.title!=='string'||!x.title.trim()||(x.url!==undefined&&(typeof x.url!=='string'||!safeUrl(x.url)))||(x.author!==undefined&&typeof x.author!=='string')||(x.year!==undefined&&typeof x.year!=='string'&&typeof x.year!=='number'))))throw Error('Invalid references: '+path);
    articles.set(data.id,{...data,aliases:data.aliases??[],categories:data.categories??[],body:match[2],path});
  }
  for (const a of articles.values()) {
    for (const key of [a.id,a.title,a.originalTitle,...a.aliases].filter(Boolean)) {
      const k=normalize(key);
      if (!aliases.has(k)) aliases.set(k,new Set());
      aliases.get(k).add(a.id);
    }
    for (const c of a.categories) {
      if (!categories.has(c)) categories.set(c,[]);
      categories.get(c).push(a.id);
    }
  }
  const structure=compileStructure(articles,categories,config);
  for(const [id,target] of Object.entries(structure.redirects)){const k=normalize(id);if(!aliases.has(k))aliases.set(k,new Set());aliases.get(k).add(target);}
  const resolve = target => {
    if (articles.has(target)) return target;
    if(Object.hasOwn(structure.redirects,target))return structure.redirects[target];
    const found=aliases.get(normalize(target));
    return found?.size===1 ? [...found][0] : null;
  };
  for (const a of articles.values()) {
    const tokens=md.parse(a.body,{});
    let heading=0;
    const toc=[], used=new Map(), refs=new Map(Object.entries(a.references??{}));
    for (let i=0;i<tokens.length;i++) {
      const token=tokens[i];
      if (token.type==='heading_open') {
        const id='section-'+(++heading); token.attrSet('id',id);
        toc.push({id,level:Number(token.tag.slice(1)),title:tokens[i+1]?.content??''});
      }
      if (token.type!=='inline') continue;
      const out=[];
      for (const child of token.children??[]) {
        if (child.type!=='text') {out.push(child);continue;}
        const re=/\[\[([^\[\]\n|]+)(?:\|([^\[\]\n]+))?\]\]|\[@([a-z0-9-]+)\]/g;
        let end=0; let m;
        const make=(type,content='')=>{const t=new child.constructor(type,'',0);t.content=content;return t;};
        while ((m=re.exec(child.content))) {
          if(m.index>end) out.push(make('text',child.content.slice(end,m.index)));
          if(m[3]){
            const key=m[3],ref=refs.get(key);
            if(!ref){diagnostics.push({code:'W002',article:a.id,target:key});out.push(make('text',m[0]));}
            else{
              if(!used.has(key))used.set(key,{number:used.size+1,count:0,ref});
              const entry=used.get(key),n=entry.number,i=++entry.count;
              out.push(make('html_inline','<sup class="citation" id="cite-'+n+'-'+i+'"><a href="#ref-'+n+'" aria-label="Chú thích '+n+'">['+n+']</a></sup>'));
            }
            end=re.lastIndex;continue;
          }
          const target=m[1].trim(), label=m[2]??target, id=resolve(target);
          if(id) {
            const open=make('link_open');open.tag='a';open.nesting=1;open.attrSet('href','/wiki/'+id+'/');out.push(open,make('text',label));const close=make('link_close');close.tag='a';close.nesting=-1;out.push(close);
            if(!backlinks.has(id)) backlinks.set(id,new Set());backlinks.get(id).add(a.id);
          } else {
            diagnostics.push({code:'W001',article:a.id,target});
            const open=make('html_inline','<span class="missing-link">');out.push(open,make('text',label),make('html_inline','</span>'));
          }
          end=re.lastIndex;
        }
        if(end<child.content.length) out.push(make('text',child.content.slice(end)));
      }
      token.children=out;
    }
    a.html=md.renderer.render(tokens,md.options,{});
    if(used.size){
      toc.push({id:'references',level:2,title:'Chú thích'});
      a.html+='<h2 id="references">Chú thích</h2><ol class="references">'+[...used.values()].map(({number:n,count,ref})=>{
        const title=escape(ref.title),link=ref.url?'<a href="'+escape(safeUrl(ref.url))+'">'+title+'</a>':title;
        return '<li id="ref-'+n+'"><span class="reference-text">'+(ref.author?escape(ref.author)+'. ':'')+link+(ref.year?' ('+escape(String(ref.year))+')':'')+'</span> <span class="reference-backlinks">'+Array.from({length:count},(_,i)=>'<a href="#cite-'+n+'-'+(i+1)+'" aria-label="Trở về lượt trích dẫn '+(i+1)+'">↑'+(count>1?i+1:'')+'</a>').join(' ')+'</span></li>';
      }).join('')+'</ol>';
    }
    a.toc=toc;
  }
  return {articles:[...articles.values()],categories:Object.fromEntries(categories),backlinks:Object.fromEntries([...backlinks].map(([k,v])=>[k,[...v]])),diagnostics,...structure};
}
