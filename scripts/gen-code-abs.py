import json, random
random.seed(7)
CID="00000000-0000-4000-8000-0000000000c0"
DELTA={'up':(0,-1),'down':(0,1),'left':(-1,0),'right':(1,0)}
def seg(a,b):
    p,q=(tuple(a),tuple(b)) if (a[0]<b[0] or (a[0]==b[0] and a[1]<=b[1])) else (tuple(b),tuple(a))
    return (p[0],p[1],q[0],q[1])
def vseg(verts):
    s=[]
    for i in range(len(verts)-1):
        cur=list(verts[i]); end=verts[i+1]
        dx=(end[0]>cur[0])-(end[0]<cur[0]); dy=(end[1]>cur[1])-(end[1]<cur[1])
        while cur!=list(end): nx=[cur[0]+dx,cur[1]+dy]; s.append(seg(cur,nx)); cur=nx
    return s
def run(world,cfg,prog):
    w,h=cfg["grid"]["w"],cfg["grid"]["h"]; pos=list(cfg["start"]); held=False; delivered=False
    walls=set(tuple(o) for o in cfg.get("walls",[]))
    item=cfg.get("items",[None])[0]; tgt=cfg.get("targets",[None])[0]
    drawn=[]; wasted=0
    target=set(vseg(cfg["target"]["vertices"])) if world=="draw" else set()
    ig=lambda p:0<=p[0]<w and 0<=p[1]<h
    def ex(ops):
        nonlocal pos,held,delivered,wasted
        for o in ops:
            t=o["op"]
            if t=="move":
                dx,dy=DELTA[o["dir"]]; n=[pos[0]+dx,pos[1]+dy]
                if not ig(n) or tuple(n) in walls: wasted+=1; continue
                if world=="draw": drawn.append(seg(pos,n))
                pos=n
            elif t=="pick": held=True if (item and pos==list(item)) else held; wasted+=(0 if item and pos==list(item) else 1)
            elif t=="drop":
                if held and tgt and pos==list(tgt): held=False; delivered=True
                else: wasted+=1
            elif t=="repeat":
                for _ in range(o["n"]): ex(o["body"])
            elif t=="if":
                d=o["cond"].split("_")[1]; dx,dy=DELTA[d]; nb=[pos[0]+dx,pos[1]+dy]
                blk=(not ig(nb)) or tuple(nb) in walls
                ex(o.get("then",[]) if blk else o.get("else",[]))
    ex(prog)
    if world=="maze": return wasted==0 and pos==list(cfg["goal"])
    if world=="draw":
        u=set(drawn); return wasted==0 and len(drawn)==len(target) and len(u)==len(drawn) and u==target
    if world=="actions": return delivered and not held
    return False

THEME={1:"sequence",2:"sequence",3:"loops",4:"conditions",5:"combo"}
AGE={1:(5,7),2:(6,8),3:(7,9),4:(8,10),5:(8,10)}; DIFF={1:1,2:2,3:2,4:3,5:3}
MAZE_P={"fr":"Amène le robot à l'étoile.","en":"Get the robot to the star."}
DRAW_P={"fr":"Reproduis le dessin.","en":"Copy the drawing."}
ACT_P={"fr":"Apporte l'objet à la cible.","en":"Bring the object to the target."}
HINT={"fr":"Avance pas à pas.","en":"Move step by step."}
def palette(L,world):
    b=['up','down','left','right']
    if L in (3,5): b.append('repeat')
    if L in (4,5) and world!='draw': b.append('if')
    if world=='actions': b+=['pick','drop']
    return b
def inject_cond(prefix, cont, decision_cell, allcells, W, H, walls):
    for D in random.sample(DIRS,4):
        dx,dy=DELTA[D]; wc=(decision_cell[0]+dx, decision_cell[1]+dy)
        if 0<=wc[0]<W and 0<=wc[1]<H and (wc not in allcells) and (wc not in walls):
            ifop={"op":"if","cond":f"wall_{D}","then":cont,"else":[{"op":"move","dir":D}]}
            return ifop,[wc[0],wc[1]]
    return None,None
def base_q(world,L,i,cfg,answer,prompt,theme):
    return {"id":f"code-{world}-l{L}-l1-{i:03d}","curriculum_id":CID,"module":"code","sub_mode":world,
      "level":L,"lesson":1,"theme":theme,"type":"code-grid","objective_ref":str(L),"prompt":prompt,
      "answer":answer,"distractors":[],"hint":HINT,"lang":"both","difficulty":DIFF[L],
      "age_min":AGE[L][0],"age_max":AGE[L][1],"concept_tags":[theme,world],
      "config":cfg,"created_by":"ai","ratings":[],"avg_rating":None,"status":"candidate"}
DIRS=['up','down','left','right']
def walk(W,H,start,steps,blocked):
    pos=list(start); moves=[]; cells=[tuple(pos)]
    for _ in range(steps):
        opts=[d for d in DIRS if (lambda n:0<=n[0]<W and 0<=n[1]<H and tuple(n) not in blocked and tuple(n) not in cells)([pos[0]+DELTA[d][0],pos[1]+DELTA[d][1]])]
        if not opts: break
        d=random.choice(opts); pos=[pos[0]+DELTA[d][0],pos[1]+DELTA[d][1]]
        moves.append({"op":"move","dir":d}); cells.append(tuple(pos))
    return cells,moves
def loopify(moves, force=False):
    out=[]; i=0; made=False
    while i<len(moves):
        j=i
        while j<len(moves) and moves[j]==moves[i]: j+=1
        if j-i>=2: out.append({"op":"repeat","n":j-i,"body":[moves[i]]}); made=True
        else: out+=moves[i:j]
        i=j
    return out,made
def verts(cells):
    v=[list(cells[0])]
    for i in range(1,len(cells)-1):
        a,b,c=cells[i-1],cells[i],cells[i+1]
        if (b[0]-a[0],b[1]-a[1])!=(c[0]-b[0],c[1]-b[1]): v.append(list(b))
    v.append(list(cells[-1])); return v

def themed(world,L):
    if L==1 or L==2: return "sequence"
    if L==3: return "loops"
    if L==4: return "conditions" if world!="draw" else "sequence"
    return "combo"

def gen(world,L,want):
    out=[]; seen=set(); tries=0
    W=H=5 if L<3 else 6
    steps={1:3,2:6,3:6,4:7,5:9}[L]
    theme=themed(world,L)
    P={"maze":MAZE_P,"draw":DRAW_P,"actions":ACT_P}[world]
    use_loop = L in (3,5)
    use_cond = (L in (4,5)) and world!="draw"
    while len(out)<want and tries<want*120:
        tries+=1
        start=[random.randrange(W),random.randrange(H)]
        if world in ("maze","draw"):
            cells,moves=walk(W,H,start,steps,set())
            if len(moves) < (4 if use_cond else (3 if L>1 else 2)): continue
            walls=[]
            if use_cond:
                k=random.randint(1,len(moves)-2)
                prefix=moves[:k]; cont=moves[k:]; dec=list(cells[k])
                if use_loop:
                    cont2,made=loopify(cont)
                    if not made: continue
                    cont=cont2
                ifop,wc=inject_cond(prefix,cont,dec,set(cells),W,H,set())
                if ifop is None: continue
                ans=prefix+[ifop]; walls=[wc]
            elif use_loop:
                ans,made=loopify(moves)
                if not made: continue
            else:
                ans=moves
            if world=="maze":
                cand=[[x,y] for x in range(W) for y in range(H) if (x,y) not in set(cells)]
                random.shuffle(cand)
                extra = (random.randint(1,2) if L==2 else random.randint(1,3) if L>=3 else 0)
                for c in cand:
                    if len(walls)>=extra+ (1 if use_cond else 0): break
                    if tuple(c) not in set(tuple(w) for w in walls): walls.append(c)
                cfg={"grid":{"w":W,"h":H},"start":start,"goal":list(cells[-1]),"walls":walls,"concept":theme,"blocks":palette(L,world)}
            else:
                cfg={"grid":{"w":W,"h":H},"start":start,"target":{"vertices":verts(cells)},"concept":theme,"blocks":palette(L,world)}
        else:  # actions
            c1,m1=walk(W,H,start,max(2,steps//2),set())
            if len(m1)<2: continue
            item=list(c1[-1])
            c2,m2=walk(W,H,item,max(3 if use_cond else 2,steps//2),set(tuple(x) for x in c1[:-1]))
            if len(m2)<(3 if use_cond else 2): continue
            tgt=list(c2[-1]); allc=set(tuple(x) for x in c1)|set(tuple(x) for x in c2)
            walls=[]
            if use_cond:
                k=random.randint(1,len(m2)-2)
                prefix2=m2[:k]; cont2=m2[k:]; dec=list(c2[k])
                if use_loop:
                    cl,made=loopify(cont2)
                    if not made: continue
                    cont2=cl
                ifop,wc=inject_cond(prefix2,cont2,dec,allc,W,H,set())
                if ifop is None: continue
                ans=m1+[{"op":"pick"}]+prefix2+[ifop]+[{"op":"drop"}]; walls=[wc]
            elif use_loop:
                m1b,a=loopify(m1); m2b,b=loopify(m2)
                if not (a or b): continue
                ans=m1b+[{"op":"pick"}]+m2b+[{"op":"drop"}]
            else:
                ans=m1+[{"op":"pick"}]+m2+[{"op":"drop"}]
            cand=[[x,y] for x in range(W) for y in range(H) if (x,y) not in allc]
            random.shuffle(cand)
            extra=(random.randint(1,2) if L==2 else random.randint(1,3) if L>=3 else 0)
            for c in cand:
                if len([w for w in walls])>=extra+(1 if use_cond else 0): break
                if tuple(c) not in set(tuple(w) for w in walls): walls.append(c)
            cfg={"grid":{"w":W,"h":H},"start":start,"items":[item],"targets":[tgt],"walls":walls,"concept":theme,"blocks":palette(L,world)}
        key=json.dumps(cfg,sort_keys=True)
        if key in seen: continue
        if not run(world,cfg,ans): continue
        seen.add(key); out.append(base_q(world,L,len(out)+1,cfg,ans,P,theme))
    return out

allq=[]; report={}
for world in("maze","draw","actions"):
    for L in range(1,6):
        qs=gen(world,L,50); report[f"{world} L{L}"]=len(qs); allq+=qs
# validate everything once more
bad=[q["id"] for q in allq if not run(q["sub_mode"],q["config"],q["answer"])]
print("counts:",report)
print("TOTAL:",len(allq),"| invalid:",len(bad), bad[:5])
if len(allq)==750 and not bad:
    json.dump({"questions":allq}, open("/tmp/code-abs.json","w"), ensure_ascii=False, indent=2)
    print("WROTE /tmp/code-abs.json")
