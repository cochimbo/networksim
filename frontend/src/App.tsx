import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import TopologyList from './pages/TopologyList';
import TopologyEditor from './pages/TopologyEditor';

// Wrapper to provide key based on route param
function TopologyEditorWithKey() {
  const { id } = useParams();
  return <TopologyEditor key={id || 'new'} />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/topologies" replace />} />
          <Route path="topologies" element={<TopologyList />} />
          <Route path="topologies/new" element={<TopologyEditorWithKey />} />
          <Route path="topologies/:id" element={<TopologyEditorWithKey />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
