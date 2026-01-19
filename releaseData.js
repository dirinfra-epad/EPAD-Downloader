// releaseData.js
async function getLatestRelease() {
  const res = await fetch('https://api.github.com/repos/dirinfra-epad/EPAD-Downloader/releases/latest');
  if (!res.ok) throw new Error('Falha ao buscar release do GitHub');

  const data = await res.json();
  const asset = data.assets?.[0];

  return {
    version: data.tag_name?.replace(/^v/i, '') || 'N/D',
    notes: data.body?.trim() || 'Sem notas de versão.',
    url: asset?.browser_download_url || '#'
  };
}
