const validId=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const entries=(x,label)=>{if(x===undefined)return [];if(!isObject(x))throw Error('Invalid '+label);return Object.entries(x);};
export function compileStructure(articles,categories,config={}){
 if(!isObject(config))throw Error('Invalid wiki structure');
 const raw=new Map(entries(config.redirects,'redirects')),redirects=new Map();
 for(const [id,target] of raw){if(!validId.test(id)||articles.has(id)||typeof target!=='string'||!validId.test(target))throw Error('Invalid redirect: '+id);}
 for(const [id] of raw){const seen=new Set([id]);let target=raw.get(id);while(raw.has(target)){if(seen.has(target))throw Error('Redirect cycle: '+id);seen.add(target);target=raw.get(target);}if(!articles.has(target))throw Error('Missing redirect target: '+id);redirects.set(id,target);}
 const parents=new Map();
 for(const [name,list] of entries(config.categoryParents,'category parents')){
  if(!name.trim()||!Array.isArray(list)||list.some(x=>typeof x!=='string'||!x.trim()))throw Error('Invalid category parents: '+name);
  parents.set(name,[...new Set(list)]);if(!categories.has(name))categories.set(name,[]);for(const p of list)if(!categories.has(p))categories.set(p,[]);
 }
 const state=new Map();
 function visit(name){if(state.get(name)===1)throw Error('Category cycle: '+name);if(state.get(name)===2)return;state.set(name,1);for(const p of parents.get(name)??[])visit(p);state.set(name,2);}
 for(const name of categories.keys())visit(name);
 const children=new Map([...categories.keys()].map(name=>[name,[]]));for(const [name,list] of parents)for(const p of list)children.get(p).push(name);
 const navboxes=new Map();
 function validTargets(list,label){if(!Array.isArray(list)||!list.length||list.some(id=>typeof id!=='string'||!articles.has(id)))throw Error('Invalid '+label);return [...new Set(list)];}
 for(const [id,box] of entries(config.navboxes,'navboxes')){
  if(!validId.test(id)||!isObject(box)||typeof box.title!=='string'||!box.title.trim())throw Error('Invalid navbox: '+id);
  navboxes.set(id,{title:box.title,articles:validTargets(box.articles,'navbox '+id)});
 }
 for(const a of articles.values()){
  if(a.kind!==undefined&&!['article','disambiguation'].includes(a.kind))throw Error('Invalid article kind: '+a.id);
  if(a.kind==='disambiguation'){a.options=validTargets(a.options,'disambiguation '+a.id);if(a.options.length<2||a.options.includes(a.id))throw Error('Invalid disambiguation options: '+a.id);}
  if(a.hatnotes!==undefined){if(!Array.isArray(a.hatnotes)||a.hatnotes.some(x=>!isObject(x)||typeof x.text!=='string'||!articles.has(x.target)||x.target===a.id))throw Error('Invalid hatnotes: '+a.id);}
  if(a.navboxes!==undefined){if(!Array.isArray(a.navboxes)||a.navboxes.some(x=>typeof x!=='string'||!navboxes.has(x)))throw Error('Invalid article navboxes: '+a.id);}
 }
 return {redirects:Object.fromEntries(redirects),categoryParents:Object.fromEntries(parents),categoryChildren:Object.fromEntries(children),navboxes:Object.fromEntries(navboxes)};
}
