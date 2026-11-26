import MarkdownIt from 'markdown-it';
import { parse } from 'yaml';
const md = new MarkdownIt({html:false,linkify:true});
const validId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const normalize = value => String(value).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/đ/g,'d').trim();
export function compileWiki(records) {
  const articles = new Map(), aliases = new Map(), diagnostics = [], categories = new Map(), backlinks = new Map();
  for (const {path,text} of records) {
    const match = text.replace(/\r\n/g,'\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) throw Error('Missing frontmatter: '+path);
    const data = parse(match[1]);
    if (!data || data.schema !== 1 || typeof data.id !== 'string' || !validId.test(data.id) || typeof data.title !== 'string' || !data.title.trim()) throw Error('Invalid article: '+path);
    if (articles.has(data.id)) throw Error('Duplicate ID: '+data.id);
    for (const key of ['aliases','categories']) if (data[key] !== undefined && (!Array.isArray(data[key]) || data[key].some(x=>typeof x!=='string'))) throw Error('Invalid '+key+': '+path);
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
  const resolve = target => {
    if (articles.has(target)) return target;
    const found=aliases.get(normalize(target));
    return found?.size===1 ? [...found][0] : null;
  };
  for (const a of articles.values()) {
    const tokens=md.parse(a.body,{});
    let heading=0;
    const toc=[];
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
        const re=/\[\[([^\[\]\n|]+)(?:\|([^\[\]\n]+))?\]\]/g;
        let end=0; let m;
        const make=(type,content='')=>{const t=new child.constructor(type,'',0);t.content=content;return t;};
        while ((m=re.exec(child.content))) {
          if(m.index>end) out.push(make('text',child.content.slice(end,m.index)));
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
    a.html=md.renderer.render(tokens,md.options,{});a.toc=toc;
  }
  return {articles:[...articles.values()],categories:Object.fromEntries(categories),backlinks:Object.fromEntries([...backlinks].map(([k,v])=>[k,[...v]])),diagnostics};
}
