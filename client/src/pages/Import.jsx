import { useRef, useState } from 'react';
import { upload } from '../api.js';
import { Icon, PageHead, toast } from '../ui.jsx';

export default function Import() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const input = useRef(null);
  const run = async () => {
    setBusy(true); setRes(null);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      setRes(await upload('/api/import', fd)); setFiles([]); if (input.current) input.current.value = '';
    } catch (er) { toast(er.message, 'err'); }
    setBusy(false);
  };
  return (
    <>
      <PageHead title="Import from Excel" sub="Load your existing Excel files. Importing the same file again never creates duplicates." />
      <div className="plate pad stack">
        <div className="kinds">
          <div><b>Serial Number Register</b><span>Creates the challan, its items and all serial numbers. Needs sheets "Serial Number Register" (and "Challan Summary").</span></div>
          <div><b>Material Delivery Tracker</b><span>Adds delivery entries. Rows are matched to challan items by name; new names become new materials. Sheet "Material Tracker".</span></div>
          <div><b>Dispatch Log</b><span>Creates a dispatch and marks its serial numbers as Dispatched. Sheet "Dispatch Details".</span></div>
        </div>
        <label className="drop">
          <Icon name="upload" size={30} />
          <b>{files.length ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Choose Excel files (.xlsx)'}</b>
          <span>{files.length ? files.map(f => f.name).join(', ') : 'You can select all three files together. The order is handled for you.'}</span>
          <input ref={input} type="file" accept=".xlsx" multiple onChange={e => setFiles([...e.target.files])} />
        </label>
        <button className="btn primary block" disabled={!files.length || busy} onClick={run}>{busy ? 'Importing...' : `Import ${files.length || ''} file${files.length === 1 ? '' : 's'}`}</button>
      </div>
      {res && res.map((r, i) => (
        <div key={i} className={'plate pad result ' + (r.ok ? 'ok' : 'bad')}>
          <div className="result-h"><Icon name={r.ok ? 'check' : 'alert'} size={20} /><div><b>{r.name}</b><small className="muted block">{r.kind || 'Unknown file'}</small></div></div>
          {r.summary.map((s, k) => <p key={k} className="r-sum">{s}</p>)}
          {r.warnings.map((s, k) => <div key={k} className="flag warn"><Icon name="alert" size={16} /><span>{s}</span></div>)}
        </div>
      ))}
    </>
  );
}
