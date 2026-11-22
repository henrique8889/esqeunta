document.querySelector('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok){document.querySelector('#error').textContent=j.error||'Não foi possível entrar.';return}location.href='/admin'});
async function checkSetup() {
  try {
    const response = await fetch('/api/auth/setup-status');
    if (!response.ok) return;
    const status = await response.json();
    document.querySelector('#setupForm').hidden = !status.setupRequired;
    document.querySelector('#loginForm').hidden = Boolean(status.setupRequired);
  } catch (error) { console.error('Não foi possível verificar a configuração inicial.', error); }
}
document.querySelector('#setupForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector('#setupError');
  error.textContent = '';
  const data = Object.fromEntries(new FormData(form));
  if (data.password !== data.confirmPassword) {
    error.textContent = 'As senhas não coincidem.';
    return;
  }
  delete data.confirmPassword;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/auth/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível criar o administrador.');
    location.href = '/admin';
  } catch (err) {
    error.textContent = err.message;
  } finally { button.disabled = false; }
});
checkSetup();
