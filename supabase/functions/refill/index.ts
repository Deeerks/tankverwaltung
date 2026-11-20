import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return reply({error:'Method not allowed'},405);try{
 const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return reply({error:'Nicht angemeldet'},401);
 const base=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,secret=Deno.env.get('REFILL_PASSWORD');if(!secret)throw new Error('REFILL_PASSWORD secret fehlt');
 const client=createClient(base,anon,{global:{headers:{Authorization:auth}}});const{data:{user},error:userError}=await client.auth.getUser();if(userError||!user)return reply({error:'Nicht angemeldet'},401);
 const body=await req.json();if(body.password!==secret)return reply({error:'Falsches Auffüllpasswort'},403);
 const tankId=Number(body.tank_id),amount=Number(body.amount),operator=String(body.operator||'').trim(),corrected=body.corrected_stock!==null&&body.corrected_stock!==undefined;const stock=corrected?Number(body.corrected_stock):null;
 if(!Number.isInteger(tankId)||!Number.isFinite(amount)||amount<=0||operator.length===0||operator.length>120||(corrected&&(!Number.isFinite(stock)||Number(stock)<0)))return reply({error:'Ungültige Angaben'},400);
 const admin=createClient(base,service);const{data,error}=await admin.rpc('record_refill_internal',{p_tank_id:tankId,p_operator:operator,p_amount:amount,p_corrected_stock:stock,p_user_id:user.id});if(error)return reply({error:error.message},400);return reply({id:data});
 }catch(e){return reply({error:String(e.message||e)},500)}});
function reply(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}})}
