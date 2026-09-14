import{h}from'./dom.js';
export function sparkline(values=[],w=90,hgt=28){
  const svg=h('svg',{width:w,height:hgt,viewBox:`0 0 ${w} ${hgt}`,'aria-label':'最近训练正确率趋势'});svg.setAttribute('role','img');
  if(values.length<2){svg.append(h('line',{x1:'2',y1:String(hgt/2),x2:String(w-2),y2:String(hgt/2),stroke:'#e2e8f0','stroke-width':'1.5','stroke-dasharray':'3 3'}));return svg}
  const min=Math.min(...values),max=Math.max(...values),range=max-min||1,pad=3;const pts=values.map((v,i)=>`${pad+i*((w-pad*2)/(values.length-1))},${hgt-pad-(v-min)/range*(hgt-pad*2)}`);const area=`M ${pts[0]} L ${pts.slice(1).join(' L ')} L ${w-pad},${hgt-pad} L ${pad},${hgt-pad} Z`;
  svg.append(h('path',{d:area,fill:'currentColor',opacity:'.08'}),h('polyline',{points:pts.join(' '),fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round'}));const[lx,ly]=pts[pts.length-1].split(',');svg.append(h('circle',{cx:lx,cy:ly,r:'2.2',fill:'currentColor'}));return svg
}
