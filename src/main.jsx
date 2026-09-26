import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import'./styles.css';

const seed={
  nodes:[
    {id:'gw',name:'核心路由器',type:'router',x:470,y:220,ip:'10.0.0.1'},
    {id:'sw1',name:'交换机 A',type:'switch',x:250,y:370,ip:'10.0.1.1'},
    {id:'sw2',name:'交换机 B',type:'switch',x:690,y:370,ip:'10.0.2.1'},
    {id:'web',name:'Web Server',type:'server',x:100,y:520,ip:'10.0.1.10'},
    {id:'db',name:'Database',type:'server',x:400,y:550,ip:'10.0.1.20'},
    {id:'user',name:'办公终端',type:'device',x:820,y:530,ip:'10.0.2.22'}
  ],
  edges:[['gw','sw1'],['gw','sw2'],['sw1','web'],['sw1','db'],['sw2','user']],
  regions:[]
};
const load=()=>{
  try{
    const d=JSON.parse(localStorage.getItem('topology'));
    return d&&Array.isArray(d.nodes)?{regions:[],...d}:seed;
  }catch{return seed}
};
const icon=t=>t==='router'?'◉':t==='switch'?'▦':t==='server'?'▣':'▱';

function App(){
  const[data,setData]=useState(load);
  const[selected,setSelected]=useState('gw');
  const[selRegion,setSelRegion]=useState(null);
  const[tool,setTool]=useState('select');
  const[notice,setNotice]=useState('');
  const[drag,setDrag]=useState(null);
  const[draft,setDraft]=useState(null);
  const board=useRef();
  useEffect(()=>localStorage.setItem('topology',JSON.stringify(data)),[data]);

  const node=data.nodes.find(n=>n.id===selected)||data.nodes[0];
  const region=data.regions.find(r=>r.id===selRegion);
  const regionOf=id=>data.regions.find(r=>r.memberIds.includes(id));
  const collapsedOf=id=>data.regions.find(r=>r.collapsed&&r.memberIds.includes(id));

  const updateNode=(k,v)=>setData({...data,nodes:data.nodes.map(n=>n.id===selected?{...n,[k]:v}:n)});
  const addNode=()=>{
    const id='node'+Date.now();
    setData({...data,nodes:[...data.nodes,{id,name:'新设备',type:'device',x:500,y:300,ip:'192.168.0.10'}]});
    setSelected(id);setSelRegion(null);setTool('select');setNotice('已添加设备');
  };
  const connect=()=>{
    if(!selected)return;
    const other=prompt('输入要连接的设备 ID（例如 sw1）');
    if(other&&data.nodes.some(n=>n.id===other)&&other!==selected&&!data.edges.some(e=>(e[0]===selected&&e[1]===other)||(e[1]===selected&&e[0]===other))){
      setData({...data,edges:[...data.edges,[selected,other]]});
      setNotice('连接已创建');
    }
  };
  const remove=()=>{
    setData({...data,
      nodes:data.nodes.filter(n=>n.id!==selected),
      edges:data.edges.filter(e=>!e.includes(selected)),
      regions:data.regions.map(r=>({...r,memberIds:r.memberIds.filter(m=>m!==selected)}))});
    setSelected(data.nodes.find(n=>n.id!==selected)?.id);
    setNotice('设备已删除');
  };
  const save=()=>setNotice('拓扑图已保存');
  const exportJson=()=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    a.download='network-topology.json';a.click();setNotice('JSON 已导出');
  };
  const validate=()=>{
    const linked=new Set(data.edges.flat());
    const isolated=data.nodes.filter(n=>!linked.has(n.id));
    setNotice(isolated.length?`发现 ${isolated.length} 个孤立节点`:'拓扑检查通过：没有孤立节点');
  };

  // ---- 区域编组 ----
  const openDraft=()=>setDraft({name:'',members:[]});
  const toggleDraft=id=>setDraft(d=>({...d,members:d.members.includes(id)?d.members.filter(m=>m!==id):[...d.members,id]}));
  const createRegion=()=>{
    const owned=new Map();
    data.regions.forEach(r=>r.memberIds.forEach(m=>owned.set(m,r.name)));
    const members=[],skipped=[];
    draft.members.forEach(m=>(owned.has(m)?skipped:members).push(m));
    if(!members.length){
      setNotice(skipped.length?'未创建区域：勾选的设备均已属于其他区域':'请先勾选至少一台设备');
      return;
    }
    const id='region'+Date.now();
    setData({...data,regions:[...data.regions,{id,name:draft.name.trim()||'未命名区域',memberIds:members,collapsed:false,x:null,y:null}]});
    setDraft(null);setSelRegion(id);setSelected(null);
    setNotice(skipped.length
      ?`区域已创建，跳过 ${skipped.length} 台已归组设备：${skipped.map(m=>`${data.nodes.find(n=>n.id===m)?.name||m}（已在「${owned.get(m)}」）`).join('、')}`
      :'区域已创建');
  };
  const toggleCollapse=(id,collapse)=>setData(d=>({...d,regions:d.regions.map(r=>{
    if(r.id!==id)return r;
    if(collapse){
      const ms=d.nodes.filter(n=>r.memberIds.includes(n.id));
      const cx=ms.length?Math.round(ms.reduce((s,n)=>s+n.x,0)/ms.length):400;
      const cy=ms.length?Math.round(ms.reduce((s,n)=>s+n.y,0)/ms.length):300;
      return{...r,collapsed:true,x:r.x??cx,y:r.y??cy};
    }
    return{...r,collapsed:false};
  })}));
  const removeRegion=id=>{
    setData({...data,regions:data.regions.filter(r=>r.id!==id)});
    if(selRegion===id)setSelRegion(null);
    setNotice('区域已解散，设备与连线均保留');
  };
  const updateRegion=(k,v)=>setData({...data,regions:data.regions.map(r=>r.id===selRegion?{...r,[k]:v}:r)});

  const move=e=>{
    if(!drag)return;
    if(drag.type==='region'){
      const dx=e.clientX-drag.px,dy=e.clientY-drag.py;
      if(!dx&&!dy)return;
      setDrag({...drag,px:e.clientX,py:e.clientY});
      setData(d=>{
        const reg=d.regions.find(r=>r.id===drag.id);
        if(!reg)return d;
        return{...d,
          nodes:d.nodes.map(n=>reg.memberIds.includes(n.id)?{...n,x:n.x+dx,y:n.y+dy}:n),
          regions:d.regions.map(r=>r.id===drag.id?{...r,x:r.x+dx,y:r.y+dy}:r)};
      });
      return;
    }
    const r=board.current.getBoundingClientRect();
    setData({...data,nodes:data.nodes.map(n=>n.id===drag.id?{...n,x:Math.max(35,e.clientX-r.left),y:Math.max(35,e.clientY-r.top)}:n)});
  };

  // 收起区域时，对外连线的端点落到区域卡片上；区域内部连线不显示
  const endpoint=id=>{
    const r=collapsedOf(id);
    if(r)return{key:'r'+r.id,x:r.x,y:r.y};
    const n=data.nodes.find(n=>n.id===id);
    return n?{key:'n'+n.id,x:n.x,y:n.y}:null;
  };
  const seen=new Set(),lines=[];
  data.edges.forEach(([a,b])=>{
    const p1=endpoint(a),p2=endpoint(b);
    if(!p1||!p2||p1.key===p2.key)return;
    const k=[p1.key,p2.key].sort().join('|');
    if(seen.has(k))return;
    seen.add(k);lines.push([p1,p2,k]);
  });

  return <div className="app">
    <header>
      <div className="brand"><span className="brand-mark">⌁</span><div><strong>NETSCAPE</strong><small>TOPOLOGY STUDIO</small></div></div>
      <div className="file"><span className="dot"></span><div><strong>office-network.json</strong><small>最近保存：刚刚</small></div></div>
      <div className="top-actions"><button onClick={validate}>✓ 检查</button><button onClick={exportJson}>↓ 导出</button><button className="save" onClick={save}>保存更改</button></div>
    </header>
    <div className="toolbar">
      <div className="tool-group"><span>工具</span>
        <button className={tool==='select'?'on':''} onClick={()=>setTool('select')}>↖ 选择</button>
        <button className={tool==='connect'?'on':''} onClick={()=>{setTool('connect');connect()}}>⌁ 连接</button>
        <button onClick={addNode}>＋ 设备</button>
        <button onClick={openDraft}>▤ 区域</button>
      </div>
      <div className="tool-group zoom"><button>−</button><span>100%</span><button>＋</button><button onClick={()=>setNotice('画布已居中')}>⌗</button></div>
    </div>
    <div className="workspace">
      <aside className="inventory">
        <div className="section-title"><span>设备库</span><small>{data.nodes.length} 个节点</small></div>
        <div className="device-types">{[['router','◉','路由器'],['switch','▦','交换机'],['server','▣','服务器'],['device','▱','终端设备']].map(([t,i,l])=><button onClick={()=>{const id='node'+Date.now();setData({...data,nodes:[...data.nodes,{id,name:l,type:t,x:500,y:320,ip:'192.168.0.2'}]});setSelected(id);setSelRegion(null)}} key={t}><i className={t}>{i}</i>{l}<span>＋</span></button>)}</div>
        <div className="section-title nodes-head"><span>区域编组</span><small>{data.regions.length} 个区域</small></div>
        <div className="region-list">
          <button className="new-region" onClick={openDraft}>＋ 新建区域</button>
          {data.regions.map(r=><div className={'region-item'+(selRegion===r.id?' sel':'')} key={r.id}>
            <button className="region-main" onClick={()=>{setSelRegion(r.id);setSelected(null)}}>
              <i>▤</i>
              <span><strong>{r.name}</strong><small>{r.memberIds.length} 台设备{r.collapsed?' · 已收起':''}</small></span>
            </button>
            <button className="region-toggle" onClick={()=>toggleCollapse(r.id,!r.collapsed)}>{r.collapsed?'展开':'收起'}</button>
          </div>)}
        </div>
        <div className="section-title nodes-head"><span>图中节点</span><small>点击查看</small></div>
        <div className="node-list">{data.nodes.map(n=><button className={selected===n.id?'sel':''} onClick={()=>{setSelected(n.id);setSelRegion(null)}} key={n.id}><i className={n.type}>{icon(n.type)}</i><span><strong>{n.name}</strong><small>{n.ip}</small></span>{regionOf(n.id)&&<em className="tag">{regionOf(n.id).name}</em>}<b>›</b></button>)}</div>
      </aside>
      <section className="canvas-wrap">
        <div className="canvas" ref={board} onMouseMove={move} onMouseUp={()=>setDrag(null)}>
          {lines.map(([p1,p2,k])=>{const dx=p2.x-p1.x,dy=p2.y-p1.y,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx)*180/Math.PI;return <div className="edge" key={k} style={{left:p1.x,top:p1.y,width:len,transform:`rotate(${ang}deg)`}}><span></span></div>})}
          {data.regions.filter(r=>r.collapsed).map(r=>
            <div className={'region-card'+(selRegion===r.id?' picked':'')} style={{left:r.x-67,top:r.y-32}} key={r.id}
              onMouseDown={e=>{e.stopPropagation();setSelRegion(r.id);setSelected(null);setDrag({type:'region',id:r.id,px:e.clientX,py:e.clientY})}}>
              <div className="rc-head"><i>▤</i><strong>{r.name}</strong></div>
              <small>{r.memberIds.length} 台设备 · 已收起</small>
              <button className="expand" onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();toggleCollapse(r.id,false)}}>⤢ 展开</button>
            </div>)}
          {data.nodes.filter(n=>!collapsedOf(n.id)).map(n=><button className={'node '+n.type+(selected===n.id?' picked':'')} style={{left:n.x-42,top:n.y-31}} onMouseDown={e=>{e.stopPropagation();setSelected(n.id);setSelRegion(null);setDrag({type:'node',id:n.id})}} onClick={()=>setSelected(n.id)} key={n.id}><i>{icon(n.type)}</i><strong>{n.name}</strong><small>{n.ip}</small></button>)}
          <div className="legend"><span><i className="router"></i>路由器</span><span><i className="switch"></i>交换机</span><span><i className="server"></i>服务器</span></div>
        </div>
        <div className="canvas-footer"><span>拖动节点调整位置 · {data.edges.length} 条连接 · {data.regions.length} 个区域</span><span>坐标系：画布局部</span></div>
      </section>
      <aside className="inspector">
        <div className="section-title"><span>属性</span><small>{region?'区域':node?.type}</small></div>
        {region?<>
          <label>区域名称<input value={region.name} onChange={e=>updateRegion('name',e.target.value)}/></label>
          <div className="inspector-actions">
            <button onClick={()=>toggleCollapse(region.id,!region.collapsed)}>{region.collapsed?'⤢ 展开区域':'▤ 收起区域'}</button>
            <button className="danger" onClick={()=>removeRegion(region.id)}>移除区域</button>
          </div>
          <div className="connections">
            <div className="section-title"><span>成员设备</span><small>{region.memberIds.length} 台</small></div>
            {region.memberIds.map(m=>{const n=data.nodes.find(n=>n.id===m);if(!n)return null;return <div className="connection" key={m}><span className={'mini '+n.type}></span><strong>{n.name}</strong><small>{n.ip}</small></div>})}
            <p className="hint">移除区域只解散编组，成员设备与连线都会保留。</p>
          </div>
        </>:node?<>
          <label>设备名称<input value={node.name} onChange={e=>updateNode('name',e.target.value)}/></label>
          <label>IP 地址<input value={node.ip} onChange={e=>updateNode('ip',e.target.value)}/></label>
          <label>设备类型<select value={node.type} onChange={e=>updateNode('type',e.target.value)}><option value="router">路由器</option><option value="switch">交换机</option><option value="server">服务器</option><option value="device">终端设备</option></select></label>
          <div className="inspector-actions"><button onClick={connect}>⌁ 添加连接</button><button className="danger" onClick={remove}>删除设备</button></div>
          <div className="connections">
            <div className="section-title"><span>连接</span><small>{data.edges.filter(e=>e.includes(node.id)).length} 条</small></div>
            {data.edges.filter(e=>e.includes(node.id)).map((e,i)=>{const other=data.nodes.find(n=>n.id===(e[0]===node.id?e[1]:e[0]));return <div className="connection" key={i}><span className={'mini '+other?.type}></span><strong>{other?.name}</strong><small>在线</small></div>})}
          </div>
        </>:<p>选择一个设备</p>}
      </aside>
    </div>
    {draft&&<div className="modal-mask" onClick={()=>setDraft(null)}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="section-title"><span>新建区域</span><small>勾选成员设备</small></div>
        <label>区域名称<input autoFocus placeholder="例如：办公区 / 机房" value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
        <div className="member-list">
          {data.nodes.map(n=>{const owner=regionOf(n.id);return <label className={'member'+(draft.members.includes(n.id)?' on':'')} key={n.id}>
            <input type="checkbox" checked={draft.members.includes(n.id)} onChange={()=>toggleDraft(n.id)}/>
            <i className={n.type}>{icon(n.type)}</i>
            <span><strong>{n.name}</strong><small>{n.ip}</small></span>
            {owner&&<em>已在「{owner.name}」，将被跳过</em>}
          </label>})}
        </div>
        <div className="modal-actions"><button onClick={()=>setDraft(null)}>取消</button><button className="primary" onClick={createRegion}>创建区域</button></div>
      </div>
    </div>}
    {notice&&<div className="toast">{notice}</div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
