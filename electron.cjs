const { app, BrowserWindow, Menu, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// Registrar el esquema del protocolo 'app' como estándar y seguro para soportar ES Modules (Vite)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true
    }
  }
]);

let mainWindow;

function createWindow() {
  const appIconPath = app.isPackaged 
    ? path.join(__dirname, 'dist', 'icon.png')
    : path.join(__dirname, 'public', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: "CONDOBill - Facturación de Condominios y Caja",
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    autoHideMenuBar: true, // Previene barras de menús innecesarias en Windows/Linux
  });

  // Cargar aplicación correspondientemente
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // En producción se carga a través de nuestro protocolo seguro en lugar de file:// para evitar CORS con ES Modules
    mainWindow.loadURL('app://-/index.html');
  }

  // Permitir inspeccionar con F12 / Ctrl+Shift+I y recargar con F5 / Ctrl+R en producción para soporte y diagnóstico
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const key = input.key.toLowerCase();
      // F12 o Ctrl+Shift+I para abrir/cerrar consola
      if (input.key === 'F12' || (input.control && input.shift && key === 'i')) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
      // F5 o Ctrl+R para refrescar la vista en caso de pantallas congeladas
      if (input.key === 'F5' || (input.control && key === 'r')) {
        mainWindow.reload();
        event.preventDefault();
      }
    }
  });

  // Abrir enlaces externos (como WhatsApp) en el navegador nativo del sistema secundario
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Bloqueo de instancia única para evitar múltiples procesos ejecutándose a la vez
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Helper para obtener el tipo MIME correcto para los archivos locales de Vite
  function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.html': return 'text/html';
      case '.js':
      case '.mjs': return 'application/javascript';
      case '.css': return 'text/css';
      case '.json': return 'application/json';
      case '.png': return 'image/png';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      case '.gif': return 'image/gif';
      case '.svg': return 'image/svg+xml';
      case '.ico': return 'image/x-icon';
      case '.woff': return 'font/woff';
      case '.woff2': return 'font/woff2';
      case '.ttf': return 'font/ttf';
      case '.otf': return 'font/otf';
      default: return 'application/octet-stream';
    }
  }

  app.whenReady().then(() => {
    // Configurar el controlador seguro para el protocolo 'app://' que lee archivos de forma sincrónica / asincrónica
    // desde el ASAR empaquetado usando Node.js fs. Este método sí soporta leer de app.asar transparentemente.
    protocol.handle('app', async (request) => {
      try {
        const { pathname } = new URL(request.url);
        let decodedPath = decodeURIComponent(pathname);
        
        // Limpiar el prefijo de host si existe (ej. /-/ o /)
        if (decodedPath.startsWith('/-/')) {
          decodedPath = decodedPath.substring(3);
        } else if (decodedPath.startsWith('/')) {
          decodedPath = decodedPath.substring(1);
        }
        
        if (decodedPath === '' || decodedPath === '/') {
          decodedPath = 'index.html';
        }
        
        const filePath = path.join(__dirname, 'dist', decodedPath);
        const data = await fs.promises.readFile(filePath);
        const mimeType = getMimeType(filePath);
        
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
          }
        });
      } catch (err) {
        console.error('Error al cargar archivo local mediante el protocolo app, intentando fallback de index.html:', err);
        try {
          const indexFilePath = path.join(__dirname, 'dist', 'index.html');
          const data = await fs.promises.readFile(indexFilePath);
          return new Response(data, {
            status: 200,
            headers: {
              'Content-Type': 'text/html',
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (innerErr) {
          console.error('Error crítico: no se pudo cargar dist/index.html:', innerErr);
          return new Response('Error interno del sistema', { status: 500 });
        }
      }
    });

    // Configurar menú de la aplicación (elimina el menú por defecto de Electron en producción)
    if (process.env.NODE_ENV !== 'development' && app.isPackaged) {
      Menu.setApplicationMenu(null);
    }
    
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
