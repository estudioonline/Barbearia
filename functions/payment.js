const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

export async function onRequestGet(context){
  const { env } = context;
  return json({
    enabled: String(env.PAYMENT_ENABLED || "").toLowerCase() === "true",
    provider: env.PAYMENT_PROVIDER || null,
    depositPercent: 50
  });
}

export async function onRequestPost(context){
  const { request, env } = context;
  let body;
  try{ body=await request.json(); }catch{ return json({error:"Dados inválidos."},400); }

  if(String(env.PAYMENT_ENABLED || "").toLowerCase() !== "true"){
    return json({error:"Pagamento online ainda não está ativado."},503);
  }

  const total=Number(body?.total);
  if(!Number.isFinite(total) || total<=0) return json({error:"Valor inválido."},400);

  const deposit=Math.round(total*0.5*100)/100;

  return json({
    ok:true,
    status:"provider-pending",
    provider:env.PAYMENT_PROVIDER || null,
    amount:deposit,
    currency:"BRL",
    message:"Base pronta. Falta conectar o gateway escolhido."
  });
}
