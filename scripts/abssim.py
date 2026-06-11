# Absolute-movement simulator (validation) — mirrors the planned kid engine.
DELTA={'up':(0,-1),'down':(0,1),'left':(-1,0),'right':(1,0)}
def seg(a,b):
    p,q=(tuple(a),tuple(b)) if (a[0]<b[0] or (a[0]==b[0] and a[1]<=b[1])) else (tuple(b),tuple(a))
    return (p[0],p[1],q[0],q[1])
def vseg(verts):
    s=set()
    for i in range(len(verts)-1):
        cur=list(verts[i]); end=verts[i+1]
        dx=(end[0]>cur[0])-(end[0]<cur[0]); dy=(end[1]>cur[1])-(end[1]<cur[1])
        while cur!=list(end):
            nx=[cur[0]+dx,cur[1]+dy]; s.add(seg(cur,nx)); cur=nx
    return s

def run(world, cfg, prog):
    w,h=cfg["grid"]["w"],cfg["grid"]["h"]
    pos=list(cfg.get("start",[0,0])); held=False; delivered=False
    obst=set(tuple(o) for o in cfg.get("obstacles",[]))
    drawn=[]; wasted=0
    target=set()
    if world=="draw":
        t=cfg["target"]; target=vseg(t["vertices"]) if "vertices" in t else set().union(*[vseg(p) for p in t["paths"]])
    def ingrid(p): return 0<=p[0]<w and 0<=p[1]<h
    def blocked(dir):
        dx,dy=DELTA[dir]; n=[pos[0]+dx,pos[1]+dy]
        return (not ingrid(n)) or tuple(n) in obst
    def ex(ops):
        nonlocal pos,held,delivered,wasted
        for o in ops:
            op=o["op"]
            if op=="move":
                dx,dy=DELTA[o["dir"]]; n=[pos[0]+dx,pos[1]+dy]
                if not ingrid(n) or tuple(n) in obst: wasted+=1; continue
                if world=="draw": drawn.append(seg(pos,n))
                pos=n
                if world=="actions" and held and cfg.get("goal") and pos==list(cfg["goal"]): pass
            elif op=="pick":
                if cfg.get("item") and pos==list(cfg["item"]): held=True
                else: wasted+=1
            elif op=="drop":
                if held and cfg.get("goal") and pos==list(cfg["goal"]): held=False; delivered=True
                else: wasted+=1
            elif op=="repeat":
                for _ in range(o["n"]): ex(o["body"])
            elif op=="if":
                c=o["cond"]; d=c.split("_")[1]
                ex(o.get("then",[]) if blocked(d) else o.get("else",[]))
    ex(prog)
    if world=="maze": return wasted==0 and pos==list(cfg["goal"])
    if world=="draw":
        uniq=set(drawn); return wasted==0 and len(drawn)==len(target) and len(uniq)==len(drawn) and uniq==target
    if world=="actions": return delivered and not held
    return False

# self-tests
maze={"grid":{"w":5,"h":5},"start":[0,4],"goal":[4,0],"obstacles":[[2,2]]}
mp=[{"op":"move","dir":"up"}]*4+[{"op":"move","dir":"right"}]*4
print("maze ok:", run("maze",maze,mp))
print("maze blocked-from-goal:", run("maze",maze,[{"op":"move","dir":"up"}]))  # ends not on goal -> False
draw={"grid":{"w":4,"h":4},"start":[0,3],"target":{"vertices":[[0,3],[0,1],[2,1]]}}
dp=[{"op":"move","dir":"up"}]*2+[{"op":"move","dir":"right"}]*2
print("draw ok:", run("draw",draw,dp))
print("draw via repeat:", run("draw",draw,[{"op":"repeat","n":2,"body":[{"op":"move","dir":"up"}]},{"op":"repeat","n":2,"body":[{"op":"move","dir":"right"}]}]))
act={"grid":{"w":5,"h":3},"start":[0,0],"item":[2,0],"goal":[4,0]}
ap=[{"op":"move","dir":"right"}]*2+[{"op":"pick"}]+[{"op":"move","dir":"right"}]*2+[{"op":"drop"}]
print("actions ok:", run("actions",act,ap))
print("actions no-pick fail:", run("actions",act,[{"op":"move","dir":"right"}]*4+[{"op":"drop"}]))
print("if (wall) sample:", run("maze",{"grid":{"w":3,"h":1},"start":[0,0],"goal":[2,0]},
      [{"op":"if","cond":"wall_up","then":[{"op":"move","dir":"right"}],"else":[{"op":"move","dir":"down"}]},{"op":"move","dir":"right"}]))
