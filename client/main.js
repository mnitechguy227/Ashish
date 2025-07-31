const { useState, useEffect } = React;

function JournalRow({ journal, onClick }) {
  return (
    <tr className="hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer" onClick={() => onClick(journal)}>
      <td className="border px-2 py-1">{journal.title}</td>
      <td className="border px-2 py-1 text-center">{journal.rank}</td>
      <td className="border px-2 py-1">{journal.field}</td>
      <td className="border px-2 py-1">{journal.publisher}</td>
      <td className="border px-2 py-1">{journal.country}</td>
    </tr>
  );
}

function DetailModal({ journal, onClose }) {
  if (!journal) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 p-4 rounded w-80">
        <h2 className="text-lg font-bold mb-2">{journal.title}</h2>
        <p className="mb-1">Rank: {journal.rank}</p>
        <p className="mb-1">Discipline: {journal.field}</p>
        <p className="mb-1">Publisher: {journal.publisher}</p>
        <p className="mb-1">Country: {journal.country}</p>
        <button className="mt-4 bg-blue-600 text-white px-3 py-1 rounded" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function SuggestModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 p-4 rounded w-96">
        <h2 className="text-lg font-bold mb-2">Suggest a Journal</h2>
        <input className="border w-full mb-2 p-1 text-black" placeholder="Journal Name" />
        <textarea className="border w-full mb-2 p-1 text-black" placeholder="Details"></textarea>
        <div className="flex justify-end space-x-2">
          <button className="px-3 py-1 bg-gray-300 rounded" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={onClose}>Submit</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('abdc');
  const [journals, setJournals] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    discipline: '',
    ranks: [],
    publisher: '',
    country: '',
    sort: 'name'
  });
  const [detail, setDetail] = useState(null);
  const [suggestOpen, setSuggestOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/${tab}`)
      .then(r => r.json())
      .then(data => setJournals(data));
  }, [tab]);

  const disciplines = Array.from(new Set(journals.map(j => j.field)));
  const countries = Array.from(new Set(journals.map(j => j.country)));
  const rankOptions = tab === 'abdc' ? ['A*','A','B','C'] : ['4*','4','3','2','1'];

  function toggleRank(r) {
    setFilters(f => ({
      ...f,
      ranks: f.ranks.includes(r) ? f.ranks.filter(x => x !== r) : [...f.ranks, r]
    }));
  }

  function applyFilters() {
    let data = journals;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      data = data.filter(j => j.title.toLowerCase().includes(s));
    }
    if (filters.discipline) {
      data = data.filter(j => j.field === filters.discipline);
    }
    if (filters.publisher) {
      const p = filters.publisher.toLowerCase();
      data = data.filter(j => j.publisher.toLowerCase().includes(p));
    }
    if (filters.country) {
      data = data.filter(j => j.country === filters.country);
    }
    if (filters.ranks.length) {
      data = data.filter(j => filters.ranks.includes(j.rank));
    }
    if (filters.sort === 'name') {
      data = data.slice().sort((a,b) => a.title.localeCompare(b.title));
    } else if (filters.sort === 'rank') {
      data = data.slice().sort((a,b) => rankOptions.indexOf(a.rank) - rankOptions.indexOf(b.rank));
    }
    return data;
  }

  const filtered = applyFilters();

  function downloadCSV() {
    alert('Download feature coming soon!');
  }

  return (
    <div className="min-h-screen">
      <h1 className="text-2xl font-bold mb-4">JournalRank Explorer</h1>
      <div className="flex items-center space-x-2 mb-4">
        <button className={`px-4 py-2 rounded ${tab==='abdc'?'bg-blue-600 text-white':'bg-gray-200'}`} onClick={() => setTab('abdc')}>ABDC Journals</button>
        <button className={`px-4 py-2 rounded ${tab==='abs'?'bg-blue-600 text-white':'bg-gray-200'}`} onClick={() => setTab('abs')}>ABS Journals</button>
        <button className="ml-auto px-4 py-2 bg-green-600 text-white rounded" onClick={() => setSuggestOpen(true)}>Suggest a Journal</button>
      </div>
      <div className="md:flex md:space-x-4">
        <div className="md:w-64 mb-4 md:mb-0 space-y-2">
          <input className="border w-full p-1 text-black" placeholder="Search title" value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} />
          <select className="border w-full p-1 text-black" value={filters.discipline} onChange={e => setFilters({...filters, discipline: e.target.value})}>
            <option value="">All Disciplines</option>
            {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="border p-2">
            <p className="font-semibold mb-1">Rank</p>
            {rankOptions.map(r => (
              <label key={r} className="block"><input type="checkbox" className="mr-1" checked={filters.ranks.includes(r)} onChange={() => toggleRank(r)} />{r}</label>
            ))}
          </div>
          <input className="border w-full p-1 text-black" placeholder="Publisher" value={filters.publisher} onChange={e => setFilters({...filters, publisher: e.target.value})} />
          <select className="border w-full p-1 text-black" value={filters.country} onChange={e => setFilters({...filters, country: e.target.value})}>
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="border w-full p-1 text-black" value={filters.sort} onChange={e => setFilters({...filters, sort: e.target.value})}>
            <option value="name">Name A-Z</option>
            <option value="rank">Rank</option>
          </select>
          <button className="w-full bg-blue-500 text-white py-1 rounded" onClick={downloadCSV}>Download Results (CSV)</button>
        </div>
        <div className="flex-1 overflow-x-auto">
          <table className="min-w-full border">
            <thead>
              <tr className="bg-gray-200 dark:bg-gray-700">
                <th className="border px-2 py-1">Journal Name</th>
                <th className="border px-2 py-1">Rank</th>
                <th className="border px-2 py-1">Discipline</th>
                <th className="border px-2 py-1">Publisher</th>
                <th className="border px-2 py-1">Country</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(j => <JournalRow key={j.issn} journal={j} onClick={setDetail} />)}
            </tbody>
          </table>
        </div>
      </div>
      <DetailModal journal={detail} onClose={() => setDetail(null)} />
      <SuggestModal open={suggestOpen} onClose={() => setSuggestOpen(false)} />
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));
