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
