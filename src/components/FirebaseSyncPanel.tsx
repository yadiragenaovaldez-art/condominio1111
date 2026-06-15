import React, { useState, useEffect } from "react";
import { 
  Cloud, 
  CloudUpload, 
  CloudDownload, 
  LogOut, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Database, 
  User,
  Chrome,
  Share2,
  Copy,
  Mail,
  Lock,
  UserPlus,
  LogIn,
  Users
} from "lucide-react";
import { auth, googleProvider } from "../lib/firebase";
import { 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged, 
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { uploadToCloud, downloadFromCloud, getLocalStats, SyncStats } from "../lib/firebaseSync";

interface FirebaseSyncPanelProps {
  onSyncComplete: () => void;
}

export default function FirebaseSyncPanel({ onSyncComplete }: FirebaseSyncPanelProps) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState("");
  const [localStats, setLocalStats] = useState<SyncStats | null>(null);
  const [autoCloudSync, setAutoCloudSync] = useState(() => {
    const rawVal = localStorage.getItem("condobill_auto_cloud_sync");
    return rawVal === null ? true : rawVal === "true";
  });

  const [groupCode, setGroupCode] = useState(() => {
    return localStorage.getItem("condobill_group_code") || "";
  });
  const [groupCodeInput, setGroupCodeInput] = useState(groupCode);

  // Email and password form state
  const [loginMethod, setLoginMethod] = useState<'google' | 'email' | 'group'>('group'); // Default to group for super easy access!
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const toggleAutoCloudSync = (enabled: boolean) => {
    localStorage.setItem("condobill_auto_cloud_sync", String(enabled));
    setAutoCloudSync(enabled);
  };

  const handleSaveGroupCode = () => {
    const cleanCode = groupCodeInput.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "");
    if (cleanCode === "") {
      localStorage.removeItem("condobill_group_code");
      setGroupCode("");
      setGroupCodeInput("");
      refreshStats();
      onSyncComplete();
      alert("Se eliminó el código de grupo. Se restauró tu espacio privado.");
    } else {
      localStorage.setItem("condobill_group_code", cleanCode);
      setGroupCode(cleanCode);
      setGroupCodeInput(cleanCode);
      refreshStats();
      onSyncComplete();
      alert(`¡Código de Grupo activado: "${cleanCode}"! Todos tus datos sincronizados ahora se compartirán con cualquiera que introduzca este mismo código.`);
    }
  };

  const handleDisableGroupCode = () => {
    localStorage.removeItem("condobill_group_code");
    setGroupCode("");
    setGroupCodeInput("");
    refreshStats();
    onSyncComplete();
    alert("Se ha desactivado el código de grupo. Regresaste a tu espacio privado.");
  };

  // Load and subscribe to Firebase Auth states
  useEffect(() => {
    setLocalStats(getLocalStats());
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshStats = () => {
    setLocalStats(getLocalStats());
  };

  const handleSignIn = async () => {
    setErrorMsg("");
    setSyncStatus('idle');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("[Firebase Signin Error]", err);
      const isDomainError = 
        err.code === "auth/unauthorized-domain" || 
        (err.message && err.message.includes("unauthorized-domain")) ||
        (err.message && err.message.includes("unauthorized"));

      if (isDomainError) {
        const currentHost = typeof window !== "undefined" ? window.location.hostname : "";
        setErrorMsg(`⚠️ DOMINIO NO AUTORIZADO: Tu aplicación Firebase aún no sabe que este entorno de vista previa es seguro.
👉 SOLUCIÓN FÁCIL: Usa la pestaña "Correo y Contraseña" al lado para conectarte de inmediato SIN configurar nada en Firebase Console.

O si prefieres Google Auth, autorízalo así:
1. Ve a tu Firebase Console.
2. Entra a 'Authentication' > pestaña 'Settings' > sección 'Authorized domains' (Dominios autorizados).
3. Haz clic en 'Add domain' e ingresa: ${currentHost}
4. Guarda los cambios y vuelve a intentar.`);
      } else {
        setErrorMsg("No se pudo iniciar sesión con Google: " + (err.message || err.code || "Error desconocido"));
      }
      setSyncStatus('error');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Completa todos los campos para continuar.");
      setSyncStatus('error');
      return;
    }
    
    setErrorMsg("");
    setSyncStatus('idle');
    setAuthLoading(true);

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err: any) {
      console.error("[Firebase Email Auth Error]", err);
      let errorResponse = err.message || err.code || "Error desconocido";
      
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        errorResponse = "Credenciales incorrectas. Verifica tu correo y contraseña, o marca 'Registrar nueva cuenta' si aún no tienes un usuario creado.";
      } else if (err.code === "auth/email-already-in-use") {
        errorResponse = "El correo ya está registrado. Intenta iniciar sesión en su lugar.";
      } else if (err.code === "auth/weak-password") {
        errorResponse = "La contraseña debe tener al menos 6 caracteres.";
      } else if (err.code === "auth/invalid-email") {
        errorResponse = "Por favor ingresa un correo electrónico válido.";
      } else if (err.code === "auth/operation-not-allowed") {
        const projectId = auth.app?.options?.projectId || "phrasal-portfolio-pszp9";
        errorResponse = `⚠️ MÉTODO NO ACTIVADO: El registro de Correo/Contraseña aún está desactivado en tu proyecto de Firebase.
Para activarlo de inmediato, sigue estos sencillos pasos:

1. Haz clic aquí para ir al panel de autenticación:
   https://console.firebase.google.com/project/${projectId}/authentication/providers
2. Haz clic en el botón "Comenzar" (si es la primera vez que entras) o "Agregar nuevo proveedor".
3. Selecciona "Correo electrónico y contraseña" (Email/Password).
4. Activa la primera casilla (Habilitar) y haz clic en "Guardar".
5. Regresa aquí y vuelve a intentar. ¡Listo!`;
      }
      
      setErrorMsg(errorResponse);
      setSyncStatus('error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setErrorMsg("");
    setSyncStatus('idle');
    try {
      await fbSignOut(auth);
    } catch (err: any) {
      setErrorMsg("Ocurrió un error al cerrar sesión.");
      setSyncStatus('error');
    }
  };

  const handleUpload = async () => {
    if (!firebaseUser) return;
    setSyncing(true);
    setSyncStatus('idle');
    setErrorMsg("");
    try {
      await uploadToCloud(firebaseUser.uid);
      setSyncStatus('success');
      refreshStats();
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Error al respaldar datos en la nube. Verifica tu conexión.");
      setSyncStatus('error');
    } finally {
      setSyncing(false);
    }
  };

  const handleDownload = async () => {
    if (!firebaseUser) return;
    
    const confirmRestore = window.confirm(
      "¿ESTÁS SEGURO? Descargar los datos de la nube REEMPLAZARÁ completamente los condominios, lecturas, ventas y productos de este dispositivo con los que tienes respaldados en la nube."
    );
    if (!confirmRestore) return;

    setSyncing(true);
    setSyncStatus('idle');
    setErrorMsg("");
    try {
      const stats = await downloadFromCloud(firebaseUser.uid);
      setSyncStatus('success');
      refreshStats();
      onSyncComplete(); // Trigger state refresh in App.tsx
      alert(`¡Restauración exitosa! Se cargaron ${stats.condos} condominios y ${stats.transactions} transacciones desde la nube.`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Error al descargar e importar los respaldos desde la nube.");
      setSyncStatus('error');
    } finally {
      setSyncing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="p-8 bg-slate-50 border border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-[10px] font-black uppercase tracking-widest">Iniciando Servicios de Nube...</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-[2.5rem] p-6 sm:p-8 space-y-6 text-left relative overflow-hidden transition-all shadow-sm">
      {/* Visual background gradient accent */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-6 -mt-6 blur-xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-inner">
            <Cloud size={20} className={syncing ? "animate-bounce" : ""} />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider leading-none">
              Sincronización en la Nube
            </h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
              Firebase Cloud Database Sync
            </p>
          </div>
        </div>
        
        {firebaseUser ? (
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Conectado
          </span>
        ) : (
          <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-full text-[9px] font-black uppercase tracking-wider">
            Solo Local
          </span>
        )}
      </div>

      {/* Connection Logic & Login Form */}
      {!firebaseUser ? (
        <div className="space-y-5">
          {/* Custom Tabs Selector */}
          <div className="flex flex-col sm:flex-row bg-slate-200/60 p-1 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => {
                setLoginMethod('group');
                setErrorMsg("");
                setSyncStatus('idle');
              }}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer ${
                loginMethod === 'group'
                  ? "bg-white text-blue-700 shadow-md"
                  : "text-slate-500 hover:text-slate-750"
              }`}
            >
              <Users size={13} className="text-blue-600" />
              (Sincronizar con código)
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginMethod('email');
                setErrorMsg("");
                setSyncStatus('idle');
              }}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer ${
                loginMethod === 'email'
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-750"
              }`}
            >
              <Mail size={13} />
              Correo y Contraseña
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginMethod('google');
                setErrorMsg("");
                setSyncStatus('idle');
              }}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer ${
                loginMethod === 'google'
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-750"
              }`}
            >
              <Chrome size={13} />
              Google Sign-In
            </button>
          </div>

          {loginMethod === 'group' ? (
            <div className="space-y-4 animate-in fade-in">
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                <strong className="text-blue-600 font-extrabold uppercase text-[9px] tracking-wider block mb-0.5">Sincronización por Código de Grupo:</strong>
                Sincronice sus datos cargados localmente usando un código compartido. Esto permite que todas las computadoras con este código vean y manipulen los mismos datos de condominio en tiempo real.
              </p>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1.5 text-left">
                    Código de Grupo Ya Creado
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1 flex items-center">
                      <Users size={14} className="absolute left-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={groupCodeInput}
                        onChange={(e) => setGroupCodeInput(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, ""))}
                        placeholder="Ejemplo: condominio_san_miguel"
                        className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-700 placeholder-slate-350 font-bold focus:outline-none focus:border-blue-500 shadow-sm"
                      />
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleSaveGroupCode}
                      className="px-5 py-3 bg-blue-600 hover:bg-blue-700 hover:scale-[1.01] text-white rounded-2xl text-[10px] font-black uppercase tracking-wider shrink-0 transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-1.5"
                    >
                      {groupCode ? "Actualizar" : "Conectar"}
                    </button>
                  </div>
                </div>

                {groupCode && (
                  <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl space-y-3.5 text-left animate-in slide-in-from-top-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Código de Grupo Activo: "{groupCode}"
                      </span>
                      
                      <button
                        type="button"
                        onClick={handleDisableGroupCode}
                        className="text-[9px] font-extrabold text-rose-500 hover:text-rose-700 uppercase tracking-tight"
                      >
                        Desconectar
                      </button>
                    </div>

                    <p className="text-[9px] text-slate-400 font-extrabold uppercase leading-normal tracking-wide">
                      OPERACIONES DE GRUPO:
                    </p>

                    <div className="grid grid-cols-2 gap-3.5">
                      {/* Pull Group Changes */}
                      <button
                        type="button"
                        disabled={syncing}
                        onClick={async () => {
                          setSyncing(true);
                          setSyncStatus('idle');
                          setErrorMsg("");
                          try {
                            const stats = await downloadFromCloud("grupo");
                            setSyncStatus('success');
                            refreshStats();
                            onSyncComplete();
                            alert(`¡Sincronización completada con éxito! Se descargaron ${stats.condos} condominios y ${stats.transactions} transacciones.`);
                          } catch (err: any) {
                            console.error(err);
                            setErrorMsg(err?.message || "Error al bajar datos del grupo.");
                            setSyncStatus('error');
                          } finally {
                            setSyncing(false);
                          }
                        }}
                        className="py-3 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
                      >
                        <CloudDownload size={14} className="text-blue-500" />
                        Bajar de la Nube
                      </button>

                      {/* Push Group Changes */}
                      <button
                        type="button"
                        disabled={syncing}
                        onClick={async () => {
                          setSyncing(true);
                          setSyncStatus('idle');
                          setErrorMsg("");
                          try {
                            await uploadToCloud("grupo");
                            setSyncStatus('success');
                            refreshStats();
                            alert("¡Sus cambios locales fueron sincronizados y respaldados con el grupo!");
                          } catch (err: any) {
                            console.error(err);
                            setErrorMsg(err?.message || "Error al subir datos del grupo.");
                            setSyncStatus('error');
                          } finally {
                            setSyncing(false);
                          }
                        }}
                        className="py-3 px-4 bg-blue-650 hover:bg-blue-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
                      >
                        <CloudUpload size={14} className={syncing ? "animate-spin" : ""} />
                        Subir Cambios
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : loginMethod === 'email' ? (
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                <strong className="text-blue-600 font-extrabold uppercase text-[9px] tracking-wider block mb-0.5">Súper fácil - Sin autorizar dominios:</strong>
                Ingresa tus credenciales a continuación. Si aún no tienes un usuario creado, marca la casilla de <strong>Registrar nueva cuenta</strong> y la crearemos al instante usando tu correo.
              </p>

              <div className="space-y-2.5">
                {/* Email input */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1.5 align-left">
                    Correo Electrónico
                  </label>
                  <div className="relative flex items-center">
                    <Mail size={14} className="absolute left-4 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ejemplo@correo.com"
                      className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-700 placeholder-slate-400 font-medium focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                  </div>
                </div>

                {/* Password input */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1.5 align-left">
                    Contraseña de la Cloud (Mínimo 6 caracteres)
                  </label>
                  <div className="relative flex items-center">
                    <Lock size={14} className="absolute left-4 text-slate-400 pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={password}
                      minLength={6}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Ingrese una contraseña"
                      className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-700 placeholder-slate-400 font-medium focus:outline-none focus:border-blue-500 shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Mode Toggle Checkbox */}
              <label className="flex items-center gap-2.5 p-3.5 bg-white/70 border border-slate-200/50 rounded-2xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isRegistering}
                  onChange={(e) => setIsRegistering(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <div className="text-left">
                  <span className="block text-[10px] font-black uppercase text-slate-700 leading-none">Registrar nueva cuenta</span>
                  <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">
                    Actívalo para crear un nuevo usuario con este correo
                  </span>
                </div>
              </label>

              {/* Action Buttons */}
              <button
                type="submit"
                className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:scale-[1.01] cursor-pointer shadow-md active:scale-95"
              >
                {isRegistering ? <UserPlus size={15} /> : <LogIn size={15} />}
                {isRegistering ? "Registrar usuario en la Nube" : "Iniciar Sesión en la Nube"}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                Si ya configuraste y agregaste el dominio de tu sistema condominial en Firebase Console, puedes usar un clic con tu cuenta de Google.
              </p>

              <button
                type="button"
                onClick={handleSignIn}
                className="w-full py-4 px-6 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-[1.01] cursor-pointer shadow-lg active:scale-95"
              >
                <Chrome className="w-5 h-5 text-blue-400 shrink-0" />
                Vincular cuenta con Google Sign-In
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Linked User Meta Detail */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {firebaseUser.photoURL ? (
                <img 
                  src={firebaseUser.photoURL} 
                  referrerPolicy="no-referrer"
                  alt="Avatar" 
                  className="w-10 h-10 rounded-full border border-slate-200"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center border border-slate-100">
                  <User size={18} />
                </div>
              )}
              <div className="text-left">
                <p className="text-xs font-black text-slate-800">{firebaseUser.displayName}</p>
                <p className="text-[10px] text-slate-400 font-bold tracking-tight">{firebaseUser.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="Cerrar sesión de Nube"
            >
              <LogOut size={16} />
            </button>
          </div>

          {/* Sync Stats Breakdown */}
          {localStats && (
            <div className="p-4 bg-slate-100/50 rounded-2xl space-y-3">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Database size={12} />
                <span className="text-[9px] font-black uppercase tracking-wider">Base de Datos de este Dispositivo</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/65">
                  <span className="block text-sm font-black text-slate-800 leading-none">{localStats.condos}</span>
                  <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-1 block">Condos</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/65">
                  <span className="block text-sm font-black text-slate-800 leading-none">{localStats.units}</span>
                  <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-1 block">Unidades</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/65">
                  <span className="block text-sm font-black text-slate-800 leading-none">{localStats.transactions}</span>
                  <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-1 block">Cobros/Gastos</span>
                </div>
              </div>
            </div>
          )}

          {/* Background Auto Cloud Sync Toggle Setting */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-4">
            <div className="flex-1 text-left">
              <span className="block text-xs font-black text-slate-800 uppercase tracking-tight">Sincronización en Tiempo Real</span>
              <span className="block text-[10px] text-slate-400 font-bold leading-normal mt-0.5">
                Al activar, todos tus cambios locales se guardan al instante y de forma continua en tu base de datos Firebase sin necesidad de guardados manuales.
              </span>
            </div>
            <button
              type="button"
              onClick={() => toggleAutoCloudSync(!autoCloudSync)}
              className={`w-12 h-6 rounded-full p-0.5 transition-all outline-none shrink-0 ${
                autoCloudSync ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : 'bg-slate-300'
              } flex items-center relative cursor-pointer`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-250 ${
                  autoCloudSync ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Grupo Compartido (Multi-usuario con correos individuales - ¡RECIÉN IMPLEMENTADO! 🚀) */}
          <div className="p-5 bg-gradient-to-br from-indigo-50/70 to-blue-50/50 border border-indigo-200/60 rounded-3xl space-y-3 shadow-inner text-left">
            <div className="flex items-center gap-2 text-indigo-700">
              <Share2 size={16} className="text-indigo-600 shrink-0" />
              <span className="text-[11px] font-black uppercase tracking-wider">Grupo Compartido (Multi-usuario)</span>
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed">
              Introduce un código único alfanumérico para que todos tus colaboradores administren y visualicen el mismo condominio en tiempo real bajo correos individuales.
            </p>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={groupCodeInput}
                onChange={(e) => setGroupCodeInput(e.target.value)}
                placeholder="Ejemplo: villa_maria_admin_2026"
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-[10px] font-mono text-slate-700 focus:outline-none shadow-sm focus:border-indigo-300"
              />
              <button
                type="button"
                onClick={handleSaveGroupCode}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.02] text-white rounded-xl text-[9px] font-black uppercase tracking-widest shrink-0 transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                Guardar Código
              </button>
            </div>
            {groupCode && (
              <div className="flex items-center justify-between pt-1 text-[9px] font-bold text-indigo-800 uppercase tracking-wider">
                <span>🟢 Código Activo: "{groupCode}"</span>
                <button
                  type="button"
                  onClick={handleDisableGroupCode}
                  className="text-rose-600 hover:text-rose-800 hover:underline outline-none cursor-pointer"
                >
                  Volver a Privado
                </button>
              </div>
            )}
          </div>

          {/* Enlace de Registro Único para Propietarios */}
          <div className="p-5 bg-gradient-to-br from-emerald-50/70 to-teal-50/50 border border-emerald-200/60 rounded-3xl space-y-3 shadow-inner text-left">
            <div className="flex items-center gap-2 text-emerald-800">
              <UserPlus size={16} className="text-emerald-750 shrink-0" />
              <span className="text-[11px] font-black uppercase tracking-wider">Tu Enlace de Registro Único</span>
            </div>
            <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed">
              Envía este enlace a tus propietarios para que registren sus datos de forma remota. Recibirás sus datos en tiempo real de manera sincronizada {groupCode ? "en el Grupo Activo" : "en tu cuenta personal"}:
            </p>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                readOnly
                value={groupCode 
                  ? `${window.location.origin}/?register-owner=true&groupId=${groupCode}` 
                  : `${window.location.origin}/?register-owner=true&adminId=${firebaseUser.uid}`
                }
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-[10px] font-mono text-slate-700 select-all focus:outline-none shadow-sm focus:border-emerald-300"
              />
              <button
                type="button"
                onClick={() => {
                  const url = groupCode 
                    ? `${window.location.origin}/?register-owner=true&groupId=${groupCode}` 
                    : `${window.location.origin}/?register-owner=true&adminId=${firebaseUser.uid}`;
                  navigator.clipboard.writeText(url);
                  alert("¡Enlace copiado al portapapeles con éxito!");
                }}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] text-white rounded-xl text-[9px] font-black uppercase tracking-widest shrink-0 transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Copy size={12} />
                Copiar
              </button>
            </div>
            <div className="pt-2.5 border-t border-slate-200/60 flex flex-wrap gap-2">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `Estimado propietario, por favor registre o actualice sus datos en nuestro sistema de administración de condominios ingresando en el siguiente enlace único:\n\n` + 
                  (groupCode 
                    ? `${window.location.origin}/?register-owner=true&groupId=${groupCode}` 
                    : `${window.location.origin}/?register-owner=true&adminId=${firebaseUser.uid}`
                  )
                )}`}
                target="_blank"
                rel="noreferrer"
                className="text-[9px] font-black uppercase tracking-wider text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 hover:scale-[1.01] px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all outline-none border border-emerald-200/50"
              >
                <span>Compartir por WhatsApp</span>
              </a>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Upload to Cloud */}
            <button
              type="button"
              disabled={syncing}
              onClick={handleUpload}
              className="py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
            >
              <CloudUpload size={16} className={syncing ? "animate-spin" : ""} />
              Respaldar en la Nube
            </button>

            {/* Download from Cloud */}
            <button
              type="button"
              disabled={syncing}
              onClick={handleDownload}
              className="py-4 px-6 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              <CloudDownload size={16} />
              Restaurar de la Nube
            </button>
          </div>
        </div>
      )}

      {/* Sync State Status Message Feedbacks */}
      {syncStatus === 'success' && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1">
          <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">¡Éxito en la Sincronización!</p>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-relaxed">Los datos locales se han acoplado y asegurado con la base de datos central en la nube correctamente.</p>
          </div>
        </div>
      )}

      {syncStatus === 'error' && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1">
          <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
          <div className="text-left w-full">
            <p className="text-[10px] font-black text-rose-800 uppercase tracking-wider">Error de Transferencia</p>
            <p className="text-[10px] text-slate-600 font-medium mt-1 leading-relaxed whitespace-pre-line select-all">{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
}
