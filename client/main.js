const e = React.createElement;

function App() {
  const [tab, setTab] = React.useState('abs');
  const [journals, setJournals] = React.useState([]);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    fetch(`/api/${tab}`)
      .then(res => res.json())
      .then(data => setJournals(data));
  }, [tab]);

  const filtered = journals.filter(j =>
    j.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    e('div', null,
      e('div', { className: 'mb-4' },
        e('button', {
          className: `mr-2 px-4 py-2 rounded ${tab==='abs'? 'bg-blue-500 text-white':'bg-gray-200'}`,
          onClick: () => setTab('abs')
        }, 'ABS'),
        e('button', {
          className: `px-4 py-2 rounded ${tab==='abdc'? 'bg-blue-500 text-white':'bg-gray-200'}`,
          onClick: () => setTab('abdc')
        }, 'ABDC')
      ),
      e('input', {
        className: 'border p-2 mb-4 w-full text-black',
        placeholder: 'Search by title',
        value: search,
        onChange: e => setSearch(e.target.value)
      }),
      e('table', { className: 'min-w-full table-auto border-collapse' },
        e('thead', null,
          e('tr', null,
            ['Title', 'Rank', 'Field', 'Country'].map(h =>
              e('th', { key: h, className: 'border px-2 py-1' }, h)
            )
          )
        ),
        e('tbody', null,
          filtered.map(j =>
            e('tr', { key: j.issn },
              e('td', { className: 'border px-2 py-1' }, j.title),
              e('td', { className: 'border px-2 py-1' }, j.rank),
              e('td', { className: 'border px-2 py-1' }, j.field),
              e('td', { className: 'border px-2 py-1' }, j.country)
            )
          )
        )
      )
    )
  );
}

ReactDOM.render(e(App), document.getElementById('root'));
