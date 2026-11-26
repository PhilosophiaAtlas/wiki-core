import test from 'node:test';
import assert from 'node:assert/strict';
import { compileWiki, normalize } from '../src/index.mjs';
const record=(id,body,title=id)=>({path:id+'.md',text:'---\nschema: 1\nid: '+id+'\ntitle: '+title+'\n---\n'+body});
test('normalizes Vietnamese',()=>assert.equal(normalize('Ý thức Đỏ'),'y thuc do'));
test('links, diagnostics and headings',()=>{
 const r=compileWiki([record('a','## Heading\n\n[[b]] [[missing]]'),record('b','Hello')]);
 assert.match(r.articles[0].html,/href="\/wiki\/b\//);
 assert.match(r.articles[0].html,/missing-link/);
 assert.equal(r.articles[0].toc.length,1);
 assert.deepEqual(r.backlinks.b,['a']);
 assert.equal(r.diagnostics[0].code,'W001');
});
test('rejects duplicate IDs',()=>assert.throws(()=>compileWiki([record('a','x'),record('a','y')]),/Duplicate/));
test('escapes raw HTML',()=>assert.doesNotMatch(compileWiki([record('a','<script>alert(1)</script>')]).articles[0].html,/<script>/));

test('named citations are reused and safely escaped',()=>{
 const a=record('a','First [@source], again [@source].');
 a.text=a.text.replace('\n---\n','\nreferences:\n  source:\n    title: "<script>test</script>"\n    url: https://example.org/\n---\n');
 const result=compileWiki([a]).articles[0];
 assert.match(result.html,/id="cite-1-1"/);assert.match(result.html,/id="cite-1-2"/);assert.match(result.html,/id="ref-1"/);
 assert.match(result.html,/href="#cite-1-2"/);assert.doesNotMatch(result.html,/<script>/);
 assert.equal(result.toc.at(-1).id,'references');
});
test('missing citation creates diagnostic',()=>assert.equal(compileWiki([record('a','[@unknown]')]).diagnostics[0].code,'W002'));
test('rejects unsafe source URLs',()=>{const a=record('a','[@x]');a.text=a.text.replace('\n---\n','\nreferences:\n  x:\n    title: Bad\n    url: "javascript:alert(1)"\n---\n');assert.throws(()=>compileWiki([a]),/Invalid references/);});

test('redirects resolve chains and wiki links use canonical targets',()=>{const r=compileWiki([record('a','[[old]]'),record('b','Hi')],{redirects:{old:'older',older:'b'}});assert.equal(r.redirects.old,'b');assert.match(r.articles[0].html,/href="\/wiki\/b\//);assert.deepEqual(r.backlinks.b,['a']);});
test('rejects cyclic and dangling redirects',()=>{assert.throws(()=>compileWiki([record('a','Hi')],{redirects:{x:'y',y:'x'}}),/cycle/);assert.throws(()=>compileWiki([record('a','Hi')],{redirects:{x:'missing'}}),/Missing/);});
test('category tree allows multiple parents but rejects cycles',()=>{const r=compileWiki([record('a','Hi')],{categoryParents:{Child:['Parent','Other']}});assert.deepEqual(r.categoryChildren.Parent,['Child']);assert.deepEqual(r.categories.Other,[]);assert.throws(()=>compileWiki([record('a','Hi')],{categoryParents:{A:['B'],B:['A']}}),/Category cycle/);});
test('navboxes and disambiguation validate targets',()=>{const a=record('a','Hi');a.text=a.text.replace('\n---\n','\nkind: disambiguation\noptions: [b, c]\nnavboxes: [topics]\n---\n');const r=compileWiki([a,record('b','B'),record('c','C')],{navboxes:{topics:{title:'Topics',articles:['b','c']}}});assert.deepEqual(r.articles[0].options,['b','c']);assert.throws(()=>compileWiki([a]),/Invalid disambiguation/);});
