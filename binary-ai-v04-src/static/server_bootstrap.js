(() => {
  async function bootstrapServerBroker() {
    try {
      const data = await api('/api/broker/bootstrap', { method: 'POST' });
      state.session = data.session_id;
      state.sessionExpiresAt = Date.now() + Number(data.expires_in || 0) * 1000;
      state.enabledBooks = Array.isArray(data.enabled_books) ? data.enabled_books : [];
      updateConnectionUI(true, 'Chave OTCharts carregada com segurança pelo servidor.');
      const books = state.enabledBooks.length ? state.enabledBooks.join(', ') : 'nenhum book habilitado';
      connectionMessage(`Broker Feed automático ativo. Books: ${books}.`, 'ok');
      setText('diagFeed', 'conectado • servidor');
      if ($('otKey')) {
        $('otKey').value = '';
        $('otKey').placeholder = 'Chave configurada com segurança no servidor';
        $('otKey').disabled = true;
      }
      setDisabled('connectBtn', true);
      if ($('connectMeta')) {
        $('connectMeta').textContent = 'A credencial está no Render como segredo OTCHARTS_API_KEY e não é enviada ao navegador.';
      }
      await loadSymbols();
      showToast('Broker Feed conectado automaticamente pelo servidor.', 'ok');
    } catch (error) {
      if (error?.status === 409) {
        setText('diagFeed', 'aguardando chave do servidor');
        return;
      }
      setText('diagFeed', 'erro na chave do servidor');
      connectionMessage(`Falha na chave OTCharts do servidor: ${error.message || 'erro desconhecido'}`, 'error');
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(bootstrapServerBroker, 350);
  });
})();
