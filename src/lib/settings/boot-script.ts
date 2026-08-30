import { ATTRIBUTE_SPEC, THEME_COLORS } from './apply';
import { SETTINGS_STORAGE_KEY, SETTINGS_VERSION } from './defaults';

/**
 * Скрипт для `<head>`, выполняется до первой отрисовки: без него страница
 * успевает нарисоваться тёмной у того, кто выбрал светлую тему.
 */
export function settingsBootScript(): string {
  const spec = JSON.stringify(ATTRIBUTE_SPEC);
  const colors = JSON.stringify(THEME_COLORS);

  const source = `(function(){try{
var S=${spec},C=${colors},K=${JSON.stringify(SETTINGS_STORAGE_KEY)},V=${SETTINGS_VERSION};
var root=document.documentElement,stored={};
try{var raw=window.localStorage.getItem(K);var parsed=raw?JSON.parse(raw):null;
if(parsed&&parsed.version===V&&parsed.settings)stored=parsed.settings;}catch(e){}
var at=function(path){var cursor=stored;for(var i=0;i<path.length;i++){
if(cursor===null||typeof cursor!=="object")return undefined;cursor=cursor[path[i]];}return cursor;};
var picked={};
for(var i=0;i<S.length;i++){var entry=S[i],value=at(entry.path);
if(entry.kind==="size"){var n=typeof value==="number"&&isFinite(value)?value:entry.fallback;
n=Math.min(Math.max(n,entry.range.min),entry.range.max);
n=entry.range.min+Math.round((n-entry.range.min)/entry.range.step)*entry.range.step;
root.style.setProperty(entry.property,n+entry.unit);}
else if(entry.kind==="enum"){var s=typeof value==="string"&&entry.values.indexOf(value)>=0?value:entry.fallback;
picked[entry.attr]=s;root.setAttribute(entry.attr,s);}
else{var b=typeof value==="boolean"?value:entry.fallback;root.setAttribute(entry.attr,b?entry.on:entry.off);}}
var mq=window.matchMedia;
var dark=mq?mq("(prefers-color-scheme: dark)").matches:true;
var theme=picked["data-theme"]==="system"?(dark?"dark":"light"):picked["data-theme"];
root.setAttribute("data-theme",theme);
if(picked["data-motion"]==="full"&&mq&&mq("(prefers-reduced-motion: reduce)").matches)
root.setAttribute("data-motion","reduced");
var meta=document.querySelector('meta[name="theme-color"]');
if(meta&&C[theme])meta.setAttribute("content",C[theme]);
}catch(e){}})();`;

  return source.replace(/<\//g, '<\\/');
}
