const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? 'http://localhost:4000/api'
  : 'https://api-qubira.onrender.com/api';
const estados = { pendiente: 'Pendiente', en_revision: 'En revisión', observado: 'Observado', revisado: 'Revisado' };
const porId = id => document.getElementById(id);
const editor = porId('editor');
const formulario = porId('formulario');
const mensaje = porId('mensaje');
const fecha = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' });
let token = sessionStorage.getItem('qubira_on_token');
let registros = [];
let actual = null;

async function api(ruta, metodo = 'GET', cuerpo) {
  const headers = {};
  if (token && ruta !== '/auth/exchange') headers.Authorization = 'Bearer ' + token;
  if (cuerpo) headers['Content-Type'] = 'application/json';
  const respuesta = await fetch(API + ruta, { method: metodo, headers, body: cuerpo && JSON.stringify(cuerpo) });
  const datos = await respuesta.json();
  if (!respuesta.ok) {
    if (respuesta.status === 401) sessionStorage.removeItem('qubira_on_token');
    throw new Error(datos.error || 'No se pudo completar la operación.');
  }
  return datos;
}

function mostrarRegistros() {
  const consulta = porId('buscar').value.trim().toLocaleLowerCase('es');
  const estado = porId('filtro').value;
  const visibles = registros.filter(r => (!estado || r.estado === estado)
    && (!consulta || `${r.referencia} ${r.titulo}`.toLocaleLowerCase('es').includes(consulta)));
  const filas = porId('filas');
  filas.replaceChildren();
  for (const registro of visibles) {
    const fila = filas.insertRow();
    fila.insertCell().textContent = registro.referencia;
    fila.insertCell().textContent = registro.titulo;
    const badge = document.createElement('span');
    badge.className = 'estado';
    badge.dataset.estado = registro.estado;
    badge.textContent = estados[registro.estado];
    fila.insertCell().append(badge);
    const fechaRegistro = fecha.format(new Date(registro.actualizado_en));
    fila.insertCell().textContent = [fechaRegistro, registro.actualizado_por].filter(Boolean).join(' · ');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = 'Revisar';
    boton.setAttribute('aria-label', 'Revisar ' + registro.referencia);
    boton.addEventListener('click', () => abrirEditor(registro));
    fila.insertCell().append(boton);
  }
  porId('resultado').textContent = visibles.length
    ? `${visibles.length} ${visibles.length === 1 ? 'documento' : 'documentos'}`
    : registros.length ? 'No hay documentos con esos filtros.' : 'Aún no hay documentos registrados.';
}

async function cargarRegistro() {
  registros = await api('/on/registro');
  mostrarRegistros();
}

function abrirEditor(registro = null) {
  actual = registro;
  formulario.reset();
  porId('titulo-editor').textContent = registro ? 'Revisar documento' : 'Registrar documento';
  for (const campo of ['referencia', 'titulo']) {
    porId(campo).value = registro?.[campo] || '';
    porId(campo).readOnly = Boolean(registro);
  }
  porId('campo-estado').hidden = !registro;
  porId('campo-observacion').hidden = !registro;
  porId('estado').value = registro?.estado || 'pendiente';
  porId('observacion').value = registro?.observacion || '';
  porId('error-editor').textContent = '';
  editor.showModal();
}

formulario.addEventListener('submit', async event => {
  event.preventDefault();
  const guardar = porId('guardar');
  if (guardar.disabled) return;
  guardar.disabled = true;
  porId('cancelar').disabled = true;
  porId('error-editor').textContent = '';
  try {
    if (actual) {
      await api(`/on/registro/${actual.id}`, 'PATCH', {
        estado: porId('estado').value, observacion: porId('observacion').value,
      });
    } else {
      await api('/on/registro', 'POST', { referencia: porId('referencia').value, titulo: porId('titulo').value });
    }
    editor.close();
    mensaje.className = '';
    mensaje.textContent = 'Registro guardado.';
    try { await cargarRegistro(); }
    catch (error) { mensaje.textContent = 'Registro guardado. Actualiza la página para ver el cambio.'; }
  } catch (error) {
    porId('error-editor').textContent = error.message;
  } finally {
    guardar.disabled = false;
    porId('cancelar').disabled = false;
  }
});
editor.addEventListener('cancel', event => {
  if (porId('guardar').disabled) event.preventDefault();
});
porId('cancelar').addEventListener('click', () => editor.close());
porId('nuevo').addEventListener('click', () => abrirEditor());
porId('buscar').addEventListener('input', mostrarRegistros);
porId('filtro').addEventListener('change', mostrarRegistros);
for (const [valor, etiqueta] of Object.entries(estados)) {
  porId('filtro').add(new Option(etiqueta, valor));
  porId('estado').add(new Option(etiqueta, valor));
}

async function iniciar() {
  mensaje.textContent = 'Cargando registro…';
  try {
    const codigo = new URLSearchParams(location.search).get('handoff');
    if (codigo) {
      history.replaceState(null, '', location.pathname);
      const sesion = await api('/auth/exchange', 'POST', { code: codigo });
      if (!sesion.user?.authorized_modules?.includes('ON')) throw new Error('Tu cuenta no tiene acceso a Oficina Notarial.');
      token = sesion.token;
      sessionStorage.setItem('qubira_on_token', token);
    }
    if (!token) throw new Error('Entra a Oficina Notarial desde el selector de módulos de Qubira.');
    await cargarRegistro();
    mensaje.textContent = '';
    porId('registro').hidden = false;
    porId('nuevo').disabled = false;
  } catch (error) {
    mensaje.className = 'error';
    mensaje.textContent = error.message;
  }
}
iniciar();
