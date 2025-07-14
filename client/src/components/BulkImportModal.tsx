import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { keysApi } from '../services/api';
import { useStore } from '../store/useStore';
import {
  ImportKeyData,
  ImportOptions,
  parseImportFile,
} from '../utils/importUtils';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ImportResult {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{ key: string; error: string }>;
  results: Array<{
    key: string;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
  }>;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const { activeConnectionId } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<
    'upload' | 'preview' | 'importing' | 'results'
  >('upload');
  const [, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedData, setParsedData] = useState<ImportKeyData[]>([]);
  const [parseErrors, setParseErrors] = useState<
    Array<{ line?: number; message: string }>
  >([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<number>>(new Set());
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    conflictResolution: 'skip',
    batchSize: 100,
  });
  const [, setImporting] = useState(false);
  const [, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) { return;}

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content);
      handleParseFile(content);
    };
    reader.readAsText(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) { return; }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content);
      handleParseFile(content);
    };
    reader.readAsText(file);
  };

  const handleParseFile = (content: string) => {
    const result = parseImportFile(content);
    setParsedData(result.keys);
    setParseErrors(result.errors);

    if (result.keys.length > 0) {
      setSelectedKeys(new Set(result.keys.map((_, index) => index)));
      setStep('preview');
    } else {
      toast.error('No valid keys found in file');
    }
  };

  const handleImport = async () => {
    if (!activeConnectionId) {
      toast.error('No active connection');
      return;
    }

    const keysToImport = parsedData.filter((_, index) =>
      selectedKeys.has(index),
    );
    if (keysToImport.length === 0) {
      toast.error('No keys selected for import');
      return;
    }

    setImporting(true);
    setStep('importing');
    setImportProgress(0);

    try {
      const { data } = await keysApi.bulkImport(
        activeConnectionId,
        keysToImport,
        importOptions,
      );
      setImportResult(data);
      setStep('results');

      if (data.successful > 0) {
        toast.success(`Successfully imported ${data.successful} keys`);
        onImportComplete();
      }

      if (data.failed > 0) {
        toast.error(`Failed to import ${data.failed} keys`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Import failed';
      toast.error(`Import failed: ${errorMessage}`);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setFileContent('');
    setFileName('');
    setParsedData([]);
    setParseErrors([]);
    setSelectedKeys(new Set());
    setImportResult(null);
    onClose();
  };

  const toggleKeySelection = (index: number) => {
    const newSelection = new Set(selectedKeys);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedKeys(newSelection);
  };

  const toggleAllKeys = () => {
    if (selectedKeys.size === parsedData.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(parsedData.map((_, index) => index)));
    }
  };

  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Import Redis Keys</h3>
        <p className="text-muted-foreground">
          Upload a file containing Redis keys to import. Supported formats:
          JSON, CSV, Redis CLI commands.
        </p>
      </div>

      <button
        type="button"
        className="w-full border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer bg-transparent"
        aria-label="Upload file by clicking or dropping file here"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium mb-2">
          Drop your file here or click to browse
        </p>
        <p className="text-sm text-muted-foreground">
          Supports .json, .csv, .txt files up to 10MB
        </p>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv,.txt"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-2">Supported Formats:</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>
            • <strong>JSON:</strong> Export files from this application or
            custom JSON arrays
          </li>
          <li>
            • <strong>CSV:</strong> Key,Type,Value,TTL format
          </li>
          <li>
            • <strong>Redis CLI:</strong> SET, LPUSH, HMSET, SADD, ZADD commands
          </li>
        </ul>
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Preview Import</h3>
          <p className="text-muted-foreground">
            {fileName} - {parsedData.length} keys found
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={toggleAllKeys}>
          {selectedKeys.size === parsedData.length
            ? 'Deselect All'
            : 'Select All'}
        </Button>
      </div>

      {parseErrors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="font-medium text-destructive">Parse Errors</span>
          </div>
          <ul className="text-sm space-y-1">
            {parseErrors.map((error, index) => (
              <li key={`parse-error-${index}-${error.line || 'no-line'}`} className="text-destructive">
                {error.line ? `Line ${error.line}: ` : ''}
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label htmlFor="conflict-resolution" className="text-sm font-medium">Conflict Resolution</label>
            <Select
              id="conflict-resolution"
              value={importOptions.conflictResolution}
              onValueChange={(value) =>
                setImportOptions({
                  ...importOptions,
                  conflictResolution: value as 'skip' | 'overwrite',
                })
              }
            >
              <option value="skip">Skip existing keys</option>
              <option value="overwrite">Overwrite existing keys</option>
            </Select>
          </div>
          <div className="flex-1">
            <label htmlFor="batch-size" className="text-sm font-medium">Batch Size</label>
            <Input
              id="batch-size"
              type="number"
              min="1"
              max="1000"
              value={importOptions.batchSize}
              onChange={(e) =>
                setImportOptions({
                  ...importOptions,
                  batchSize: parseInt(e.target.value) || 100,
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="max-h-96 overflow-auto border rounded-lg">
        <table className="w-full">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="w-12 p-2"></th>
              <th className="text-left p-2">Key</th>
              <th className="text-left p-2">Type</th>
              <th className="text-left p-2">Value Preview</th>
              <th className="text-left p-2">TTL</th>
            </tr>
          </thead>
          <tbody>
            {parsedData.map((keyData, index) => (
              <tr key={`key-data-${index}-${keyData.key}`} className="border-t">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(index)}
                    onChange={() => toggleKeySelection(index)}
                    className="rounded"
                  />
                </td>
                <td className="p-2 font-mono text-sm">{keyData.key}</td>
                <td className="p-2">
                  <span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs">
                    {keyData.type}
                  </span>
                </td>
                <td className="p-2 max-w-xs truncate text-sm">
                  {typeof keyData.value === 'string'
                    ? keyData.value
                    : JSON.stringify(keyData.value).slice(0, 100) + '...'}
                </td>
                <td className="p-2 text-sm">
                  {keyData.ttl ? `${keyData.ttl}s` : 'No expiry'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => setStep('upload')}>
          Back
        </Button>
        <Button onClick={handleImport} disabled={selectedKeys.size === 0}>
          Import {selectedKeys.size} Keys
        </Button>
      </div>
    </div>
  );

  const getImportStatusIcon = () => {
    if (importResult!.failed === 0) {
      return <CheckCircle className="h-16 w-16 text-green-500" />;
    }
    if (importResult!.successful === 0) {
      return <XCircle className="h-16 w-16 text-destructive" />;
    }
    return <AlertCircle className="h-16 w-16 text-yellow-500" />;
  };

  const renderImportingStep = () => (
    <div className="space-y-6 text-center">
      <div>
        <Clock className="h-16 w-16 text-primary mx-auto mb-4 animate-spin" />
        <h3 className="text-lg font-semibold mb-2">Importing Keys...</h3>
        <p className="text-muted-foreground">
          Please wait while we import your keys to Redis
        </p>
      </div>
    </div>
  );

  const renderResultsStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          {getImportStatusIcon()}
        </div>
        <h3 className="text-lg font-semibold mb-2">Import Complete</h3>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {importResult!.successful}
          </div>
          <div className="text-sm text-green-600 dark:text-green-400">
            Successful
          </div>
        </div>
        <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {importResult!.failed}
          </div>
          <div className="text-sm text-red-600 dark:text-red-400">Failed</div>
        </div>
        <div className="text-center p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
          <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
            {importResult!.total}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total</div>
        </div>
      </div>

      {importResult!.errors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 max-h-48 overflow-auto">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="font-medium text-destructive">Import Errors</span>
          </div>
          <ul className="text-sm space-y-1">
            {importResult!.errors.map((error, index) => (
              <li key={`import-error-${index}-${error.key}`} className="text-destructive">
                <span className="font-mono">{error.key}</span>: {error.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleClose}>Close</Button>
      </div>
    </div>
  );

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-[50%] top-[50%] max-h-[90vh] w-[90vw] max-w-4xl translate-x-[-50%] translate-y-[-50%] rounded-lg bg-background p-6 shadow-lg overflow-auto">
          <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
          </Dialog.Close>

          {step === 'upload' && renderUploadStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'importing' && renderImportingStep()}
          {step === 'results' && renderResultsStep()}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
