import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import TopologyList from './pages/TopologyList';
import TopologyEditor from './pages/TopologyEditor';
import Settings from './pages/Settings';
import Scenarios from './pages/Scenarios';
import Volumes from './pages/Volumes';
import { ErrorBoundary } from './components/ErrorBoundary';

// Wrapper to provide key based on route param
function TopologyEditorWithKey() {
  const { id } = useParams();
  return <TopologyEditor key={id || 'new'} />;
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/topologies" replace />} />
            <Route path="topologies" element={<TopologyList />} />
            <Route path="topologies/new" element={<TopologyEditorWithKey />} />
            <Route path="topologies/:id" element={<TopologyEditorWithKey />} />
            <Route path="scenarios" element={<Scenarios />} />
            <Route path="volumes" element={<Volumes />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
