import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import TopologyList from './pages/TopologyList';
import TopologyEditor from './pages/TopologyEditor';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/topologies" replace />} />
          <Route path="topologies" element={<TopologyList />} />
          <Route path="topologies/new" element={<TopologyEditor />} />
          <Route path="topologies/:id" element={<TopologyEditor />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
