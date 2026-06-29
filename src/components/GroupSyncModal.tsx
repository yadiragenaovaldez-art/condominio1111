import React, { useState, useEffect } from "react";
import { 
  X, 
  Users, 
  Cloud, 
  Download, 
  Upload, 
  Database, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert,
  PlusCircle,
  Lock 
} from "lucide-react";
import { auth } from "../lib/firebase";
import { uploadToCloud, downloadFromCloud, getLocalStats, ensureFirebaseAuth, checkGroupCodeExists, createGroupCodeInCloud } from "../lib/firebaseSync";

interface GroupSyncModalProps {
  onClose: () => void;
  onReload: () => void;
}

export default function GroupSyncModal({ onClose, onReload }: GroupSyncModalProps) {
  const [groupCode, setGroupCode] = useState(() => 
    (localStorage.getItem("condobill_group_code") || "").trim()
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [localStats, setLocalStats] = useState(() => getLocalStats());
  const [groupAction, setGroupAction] = useState<'connect' | 'create'>('connect');

  useEffect(() => {
    setLocalStats(getLocalStats());
  }, []);

  const handleSaveCodeOnly = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const code = groupCode.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "");
    try {
      if (code !== "") {
        if (groupAction === 'create') {
          // Explicitly create the group
          const exists = await checkGroupCodeExists(code);
          if (exists) {
            throw new Error(`La creación falló: El código de grupo "${code}" ya existe en el sistema. Elige otro nombre.`);
          }
          await createGroupCodeInCloud(code);
          localStorage.setItem("condobill_group_code", code);
          const user = await ensureFirebaseAuth();
          
          // Subir datos locales para inicializar el grupo nuevo
          await uploadToCloud(user?.uid || "grupo");
          
          setMessage({
            text: `¡Nuevo grupo "${code}" creado con éxito en la nube! Se han subido tus datos locales para inicializar el grupo.`,
            type: "success"
          });
        } else {
          // Connect to existing group
          const exists = await checkGroupCodeExists(code);
          if (exists) {
            // Evitar que el auto-sync suba datos locales viejos mientras descargamos
            localStorage.setItem("condobill_is_syncing_init", "true");
            localStorage.setItem("condobill_group_code", code);
            
            const user = await ensureFirebaseAuth();
            
            // Descargar los datos de la nube inmediatamente
            const stats = await downloadFromCloud(user?.uid || "grupo");
            setLocalStats(stats);
            
            setMessage({
              text: `¡Código de grupo "${code}" conectado con éxito! Se han descargado ${stats.condos} condominio(s) de este grupo. Este dispositivo se mantendrá sincronizado automáticamente en segundo plano.`,
              type: "success"
            });

            setTimeout(() => {
              localStorage.removeItem("condobill_is_syncing_init");
            }, 1000);
          } else {
            const createConfirm = window.confirm(
              `El código de grupo "${code}" NO está registrado todavía en el sistema.\n\n` +
              `¿Deseas CREAR este nuevo grupo en la nube para que otros dispositivos puedan sincronizarse usando el mismo código?`
            );
            if (createConfirm) {
              await createGroupCodeInCloud(code);
              localStorage.setItem("condobill_group_code", code);
              const user = await ensureFirebaseAuth();
              
              // Subir datos locales para inicializar el grupo nuevo
              await uploadToCloud(user?.uid || "grupo");
              
              setMessage({
                text: `¡Nuevo grupo "${code}" creado e iniciado con éxito! Se han subido tus datos locales para inicializar el grupo.`,
                type: "success"
              });
            } else {
              setMessage({
                text: `El código de grupo ingresado no existe. Elige un código existente o cambia a la opción 'Crear Nuevo Grupo'.`,
                type: "error"
              });
            }
          }
        }
      } else {
        localStorage.removeItem("condobill_group_code");
        setMessage({
          text: "Se ha removido el código de grupo. El sistema vuelve a operar en modo puramente Local Offline independiente.",
          type: "info"
        });
      }
      onReload();
    } catch (err: any) {
      console.error(err);
      setMessage({
        text: err?.message || "Ocurrió un error inesperado al intentar configurar el canal de sincronización.",
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePullFromGroup = async () => {
    const code = groupCode.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "");
    if (!code) {
      setMessage({ text: "Debe ingresar un código de grupo válido.", type: "error" });
      return;
    }

    if (!confirm("Al descargar la base de datos de grupo, se reemplazará la información local actual de este dispositivo y se unificará con los servidores de nube. ¿Deseas continuar?")) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const exists = await checkGroupCodeExists(code);
      if (!exists) {
        throw new Error(`El código de grupo "${code}" no existe en el sistema. Debes ingresar un grupo ya existente o crearlo primero.`);
      }
      localStorage.setItem("condobill_group_code", code);
      const user = await ensureFirebaseAuth();
      if (!user) {
        throw new Error("No se pudo iniciar la sesión en la nube para descargar.");
      }
      const stats = await downloadFromCloud(user.uid);
      setLocalStats(stats);
      setMessage({
        text: `¡Sincronización de unificación completada con éxito! Se han descargado ${stats.condos} condominio(s), ${stats.receipts} recibo(s) y ${stats.transactions} transacción(es).`,
        type: "success"
      });
      onReload();
    } catch (err: any) {
      console.error(err);
      setMessage({
        text: err?.message || "No se pudo bajar la información de este grupo. Revisa el código e internet.",
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePushToGroup = async () => {
    const code = groupCode.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "");
    if (!code) {
      setMessage({ text: "Debe ingresar un código de grupo válido.", type: "error" });
      return;
    }

    if (!confirm("Esto subirá todos los condominios, unidades y recibos de este dispositivo al espacio compartido de grupo en la nube. Los cambios de otros operadores se unificarán. ¿Deseas respaldar ahora?")) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const exists = await checkGroupCodeExists(code);
      if (!exists) {
        const createConfirm = window.confirm(
          `El código de grupo "${code}" no existe todavía en el sistema.\n\n¿Deseas CREAR este nuevo grupo en la nube para poder respaldar y compartir tus datos con otros?`
        );
        if (createConfirm) {
          await createGroupCodeInCloud(code);
        } else {
          throw new Error("El respaldo fue cancelado porque el código de grupo no existe.");
        }
      }
      localStorage.setItem("condobill_group_code", code);
      const user = await ensureFirebaseAuth();
      if (!user) {
        throw new Error("No se pudo iniciar la sesión en la nube para respaldar.");
      }
      await uploadToCloud(user.uid);
      setMessage({
        text: "¡Respaldo a la nube del grupo completado de forma exitosa! Todos los operadores unificados con este código verán sus transacciones actualizadas.",
        type: "success"
      });
    } catch (err: any) {
      console.error(err);
      setMessage({
        text: err?.message || "Error al subir los datos en la nube del grupo.",
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-300">
      <div 
        className="bg-white rounded-[2rem] p-8 max-w-lg w-full border border-slate-100 shadow-2xl flex flex-col space-y-6 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background visual highlight */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/30 rounded-full -mr-16 -mt-16 blur-2xl" />

        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all border border-slate-100"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm shrink-0">
            <Users size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase italic tracking-tight">
              Sincronización de Grupo
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5 leading-relaxed">
              Trabaje en multi-usuario uniendo múltiples computadoras a una misma base de datos en tiempo real mediante un código.
            </p>
          </div>
        </div>

        {/* Selector de Acción de Grupo */}
        <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => {
              setGroupAction('connect');
              setMessage(null);
            }}
            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer ${
              groupAction === 'connect'
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Users size={12} />
            Conectar a Grupo
          </button>
          <button
            type="button"
            onClick={() => {
              setGroupAction('create');
              setMessage(null);
            }}
            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer ${
              groupAction === 'create'
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <PlusCircle size={12} />
            Crear Nuevo Grupo
          </button>
        </div>

        {/* Code Form */}
        <form onSubmit={handleSaveCodeOnly} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">
              {groupAction === 'connect' ? "Código de Acceso Compartido" : "Escribe un Código de Grupo Único para Crear"}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, ""))}
                placeholder={groupAction === 'connect' ? "Ejemplo: condominio_maria" : "Ejemplo: residencial_sauces_nuevo"}
                className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 transition-all placeholder:text-slate-300"
                disabled={loading}
              />
              <button
                type="submit"
                className={`text-white font-extrabold text-xs uppercase px-5 py-3 rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5 ${
                  groupAction === 'connect' 
                    ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800" 
                    : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800"
                }`}
                disabled={loading}
              >
                {loading ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : groupAction === 'connect' ? (
                  "Conectar"
                ) : (
                  "Crear Grupo"
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Dynamic feedback messages */}
        {message && (
          <div 
            className={`p-4 rounded-2xl border flex gap-3 text-xs leading-relaxed ${
              message.type === "success" 
                ? "bg-emerald-50/50 border-emerald-100 text-emerald-800"
                : message.type === "info"
                ? "bg-blue-50/50 border-blue-100 text-blue-800"
                : "bg-rose-50 border-rose-100 text-rose-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
            ) : message.type === "info" ? (
              <Cloud size={16} className="text-blue-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
            )}
            <p className="font-medium whitespace-pre-line">{message.text}</p>
          </div>
        )}

        {/* Action center keys */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handlePullFromGroup}
            disabled={loading || !groupCode.trim()}
            className="group relative flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/30 hover:border-blue-400 hover:bg-blue-50/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-blue-600 shadow-sm group-hover:scale-110 transition-transform">
              <Download size={20} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black uppercase text-blue-700 tracking-wider text-center">Bajar de la Nube</p>
              <p className="text-[9px] text-slate-400 text-center mt-0.5">Sincroniza y une datos</p>
            </div>
          </button>

          <button
            onClick={handlePushToGroup}
            disabled={loading || !groupCode.trim()}
            className="group relative flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 border-slate-50 bg-slate-50/30 hover:border-amber-400 hover:bg-amber-50/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-amber-600 shadow-sm group-hover:scale-110 transition-transform">
              <Upload size={20} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black uppercase text-amber-700 tracking-wider text-center">Subir Cambios</p>
              <p className="text-[9px] text-slate-400 text-center mt-0.5">Almacena cambios locales</p>
            </div>
          </button>
        </div>

        {/* Info label about permissions */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-slate-500 text-[11px] leading-relaxed flex gap-3.5 items-start">
          <ShieldAlert size={16} className="text-indigo-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-extrabold uppercase italic tracking-tighter text-slate-700">
              Operadores Locales Soporte Completo
            </p>
            <p>
              Las limitaciones del sistema (módulos autorizados y bloqueos asignados) se mantendrán vigentes de forma idéntica sin importar con qué código o grupo se vincule este equipo.
            </p>
          </div>
        </div>

        {/* Mini stats tracker */}
        <div className="pt-2 border-t border-slate-150 flex items-center justify-between text-[10px] text-slate-400">
          <p className="font-bold flex items-center gap-1 uppercase">
            <Database size={12} />
            Inventario de datos local:
          </p>
          <div className="flex gap-2 font-black text-slate-600 uppercase tracking-tighter">
            <span>{localStats.condos} Condos</span>
            <span>•</span>
            <span>{localStats.receipts} Recibos</span>
            <span>•</span>
            <span>{localStats.transactions} Pagos</span>
          </div>
        </div>
      </div>
    </div>
  );
}
