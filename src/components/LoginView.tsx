import React, { useState } from "react";
import { User, Lock, Eye, EyeOff, LogIn, ShieldAlert } from "lucide-react";
import { AppUser } from "../types";
import { storage } from "../lib/storage";
import { auth } from "../lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

interface LoginViewProps {
  onLogin: (user: AppUser) => void;
}

export default function LoginView({ onLogin }: LoginViewProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Por favor completa todos los campos.");
      return;
    }

    setLoading(true);

    // 1. Intentar primero con la Autenticación Local
    const allUsers = storage.getUsers();
    const matchedUser = allUsers.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (matchedUser && matchedUser.passwordHash === password) {
      if (!matchedUser.permissions || matchedUser.permissions.length === 0) {
        setError("Este usuario no cuenta con casillas de acceso asignadas. Contacte al administrador.");
        setLoading(false);
        return;
      }
      setLoading(false);
      onLogin(matchedUser);
      return;
    }

    // 2. Si las credenciales locales no coinciden o no existe el usuario local, intentamos vía Firebase Authentication
    try {
      const isEmail = username.includes("@");
      let emailToAuth = username.trim();

      // Si ingresaron un nombre de usuario que coincide con un usuario local que tiene correo válido
      if (!isEmail && matchedUser?.username && matchedUser.username.includes("@")) {
        emailToAuth = matchedUser.username;
      }

      const finalIsEmail = emailToAuth.includes("@") && emailToAuth.length > 3;

      if (!finalIsEmail) {
        if (matchedUser && matchedUser.passwordHash !== password) {
          setError("Contraseña incorrecta. Por favor verifique e intente nuevamente.");
        } else {
          setError("El usuario ingresado no existe en el sistema ni es un correo electrónico de Firebase válido.");
        }
        setLoading(false);
        return;
      }

      // Realizar la autenticación real en Firebase
      const userCredential = await signInWithEmailAndPassword(auth, emailToAuth, password);
      const fbUser = userCredential.user;

      if (fbUser) {
        const latestUsers = storage.getUsers();
        let finalUser = latestUsers.find(
          (u) => u.id === fbUser.uid || u.username.toLowerCase() === fbUser.email?.toLowerCase()
        );

        if (!finalUser) {
          // Crear un usuario local sincronizado y con todos los permisos por defecto
          finalUser = {
            id: fbUser.uid,
            name: fbUser.displayName || fbUser.email?.split("@")[0] || "Usuario Nube",
            username: fbUser.email || username.trim(),
            passwordHash: password, // Almacenar contraseña local para permitir accesos offline futuros
            cargo: "Administrador Cloud",
            permissions: ['dashboard', 'income', 'expense', 'billing', 'generalBilling', 'calculator', 'cashClose', 'condos', 'settings', 'users', 'personal', 'reporte_diario'],
            createdAt: new Date().toISOString()
          };
          const updatedUsers = [...latestUsers, finalUser];
          storage.saveUsers(updatedUsers);
        } else {
          // Si el usuario existe, sincronizar la contraseña local para que coincida con la de Firebase
          let changed = false;
          if (finalUser.passwordHash !== password) {
            finalUser.passwordHash = password;
            changed = true;
          }
          if (!finalUser.permissions || finalUser.permissions.length === 0) {
            finalUser.permissions = ['dashboard', 'income', 'expense', 'billing', 'generalBilling', 'calculator', 'cashClose', 'condos', 'settings', 'users', 'personal', 'reporte_diario'];
            changed = true;
          }
          if (changed) {
            storage.saveUsers(latestUsers);
          }
        }

        setLoading(false);
        onLogin(finalUser);
        return;
      }
    } catch (fbErr: any) {
      console.error("[Firebase Login Error]", fbErr);
      
      let friendlyError = "";
      if (fbErr.code === "auth/invalid-credential" || fbErr.code === "auth/wrong-password" || fbErr.code === "auth/user-not-found") {
        friendlyError = "Credenciales incorrectas de Firebase. Verifica tu usuario/correo y contraseña.";
      } else if (fbErr.code === "auth/invalid-email") {
        friendlyError = "El correo electrónico de Firebase ingresado no es válido.";
      } else if (fbErr.code === "auth/network-request-failed") {
        friendlyError = "Error de red: No se pudo conectar a los servidores de Firebase.";
      } else {
        friendlyError = fbErr.message || "Usuario o contraseña no válidos en el sistema local ni en Firebase.";
      }

      if (matchedUser && matchedUser.passwordHash !== password) {
        setError("Contraseña incorrecta. Por favor verifique e intente nuevamente.");
      } else {
        setError(friendlyError);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 font-sans p-4 relative overflow-hidden select-none">
      {/* Decorative background glows */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="w-full max-w-md bg-slate-950/80 backdrop-blur-xl border border-slate-800 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl shadow-black/80 relative z-10 transition-all">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 font-black text-2xl text-white shadow-xl shadow-blue-500/20 mb-4">
            CB
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white leading-none">
            <span className="text-blue-500">CONDO</span>Bill
          </h1>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.25em] mt-2">
            Control de Acceso y Gestión
          </p>
        </div>

        {/* Error Messages */}
        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-left">
              <p className="text-xs font-bold text-rose-400 uppercase tracking-wide">Error de Autenticación</p>
              <p className="text-xs text-slate-300 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Username Input */}
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
              Usuario de Sistema o Correo Firebase
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                <User size={18} />
              </div>
              <input
                type="text"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ejemplo: admin@correo.com o Admin"
                disabled={loading}
                className="w-full h-12 pl-12 pr-4 bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-blue-500 rounded-xl text-sm font-bold text-white outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder-slate-600"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
              Contraseña
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••"
                disabled={loading}
                className="w-full h-12 pl-12 pr-12 bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-blue-500 rounded-xl text-sm font-bold text-white outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder-slate-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 focus:outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={16} /> Iniciar Sesión En El Sistema
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
