import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, X, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import { apiFetch } from '../api/client';
import type { InvoiceParsedHeader, InvoiceMatchedItem } from '../../shared/schemas';

interface InvoiceUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParsed: (result: {
    invoice: InvoiceParsedHeader;
    items: InvoiceMatchedItem[];
    existingInvoiceWarning?: string | null;
  }) => void;
}

export const InvoiceUploaderModal: React.FC<InvoiceUploaderModalProps> = ({
  isOpen,
  onClose,
  onParsed,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setErrorMsg(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMsg('Por favor seleccioná un archivo PDF de factura.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('El archivo supera el tamaño máximo permitido de 15 MB.');
      return;
    }
    setSelectedFile(file);
  };

  const handleUploadAndParse = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await apiFetch<any>('/invoices/parse', {
        method: 'POST',
        body: formData,
      });

      onParsed(res);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar la factura con IA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Ingreso Inteligente de Factura</h3>
              <p className="text-xs text-slate-500">Extracción automática de ítems y costos con IA</p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Zona de Drop */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => !loading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-orange-500 bg-orange-50/50'
              : 'border-slate-300 hover:border-slate-400 bg-slate-50/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="hidden"
            disabled={loading}
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="p-3 bg-white shadow-xs rounded-full border border-slate-200 text-slate-500">
              <UploadCloud className="h-6 w-6 text-orange-600" />
            </div>
            <p className="text-xs font-semibold text-slate-800">
              Arrastrá acá la factura PDF o <span className="text-orange-600 underline">buscala en tu equipo</span>
            </p>
            <p className="text-[11px] text-slate-400">
              Compatible con comprobantes de SKF, Movimiento Mecánico, Alfa, ICEPAR, Cedisa, etc. (Máx. 15 MB)
            </p>
          </div>
        </div>

        {/* Archivo seleccionado */}
        {selectedFile && (
          <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <FileText className="h-5 w-5 text-orange-600 shrink-0" />
              <div className="truncate">
                <p className="text-xs font-bold text-slate-900 truncate">{selectedFile.name}</p>
                <p className="text-[10px] text-slate-500 font-mono">
                  {(selectedFile.size / 1024).toFixed(1)} KB · Documento PDF
                </p>
              </div>
            </div>
            {!loading && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                }}
                className="text-slate-400 hover:text-rose-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Botones */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-medium text-slate-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selectedFile || loading}
            onClick={handleUploadAndParse}
            className="px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analizando comprobante con IA...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Procesar Factura</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
