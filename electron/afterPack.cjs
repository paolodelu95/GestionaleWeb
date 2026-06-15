// Hook electron-builder eseguito dopo il packaging di ogni piattaforma.
//
// Su macOS, senza un certificato "Developer ID" valido, electron-builder salta
// la firma (identity:null). Il bundle resta però con la sola firma "linker" del
// binario Electron, che NON copre le risorse che aggiungiamo (app.asar, backend
// in extraResources): la firma diventa invalida e macOS, su un'app scaricata
// (in quarantena), mostra «"Ordeva" è danneggiato e non può essere aperto».
//
// Ri-firmiamo ad-hoc l'intero bundle: la firma torna valida e copre tutto.
// L'app NON è notarizzata (serve un account Apple Developer), quindi al primo
// avvio l'utente deve aprirla con tasto destro → Apri (o rimuovere la
// quarantena con `xattr -dr com.apple.quarantine Ordeva.app`).
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  console.log(`▶ Firma ad-hoc del bundle: ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
};
