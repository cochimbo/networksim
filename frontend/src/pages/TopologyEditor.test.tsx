import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TopologyEditor from './TopologyEditor';

// Mock cytoscape
vi.mock('cytoscape', () => ({
  default: vi.fn(() => ({
    on: vi.fn(),
    add: vi.fn(),
    elements: vi.fn(() => ({ remove: vi.fn() })),
    $: vi.fn(() => ({ 
      remove: vi.fn(),
      data: vi.fn(),
      style: vi.fn(),
      addClass: vi.fn(),
      removeClass: vi.fn(),
    })),
    zoom: vi.fn(() => 1),
    fit: vi.fn(),
    destroy: vi.fn(),
  })),
}));

// Mock react-router-dom params
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ id: undefined }),
    useNavigate: () => vi.fn(),
  };
});

// Mock API
vi.mock('../services/api', () => ({
  topologyApi: {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(() => Promise.resolve([])),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );
  };
};

describe('TopologyEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the editor with toolbar', () => {
    render(<TopologyEditor />, { wrapper: createWrapper() });
    
    expect(screen.getByPlaceholderText('Topology name')).toBeInTheDocument();
    expect(screen.getByTitle('Select')).toBeInTheDocument();
    expect(screen.getByTitle('Add Node')).toBeInTheDocument();
    expect(screen.getByTitle('Add Link (click two nodes)')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom In')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom Out')).toBeInTheDocument();
    expect(screen.getByTitle('Fit to View')).toBeInTheDocument();
  });

  it('shows default name input', () => {
    render(<TopologyEditor />, { wrapper: createWrapper() });
    
    const nameInput = screen.getByPlaceholderText('Topology name') as HTMLInputElement;
    expect(nameInput.value).toBe('New Topology');
  });

  it('allows changing topology name', () => {
    render(<TopologyEditor />, { wrapper: createWrapper() });
    
    const nameInput = screen.getByPlaceholderText('Topology name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My Custom Topology' } });
    
    expect(nameInput.value).toBe('My Custom Topology');
  });

  it('shows properties panel with instructions when nothing selected', () => {
    render(<TopologyEditor />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Properties')).toBeInTheDocument();
    expect(screen.getByText('Select a node or edge to view properties')).toBeInTheDocument();
  });

  it('has a save button', () => {
    render(<TopologyEditor />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('has a description textarea', () => {
    render(<TopologyEditor />, { wrapper: createWrapper() });
    
    const textarea = screen.getByPlaceholderText('Add a description...');
    expect(textarea).toBeInTheDocument();
  });

  it('allows changing description', () => {
    render(<TopologyEditor />, { wrapper: createWrapper() });
    
    const textarea = screen.getByPlaceholderText('Add a description...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Test description' } });
    
    expect(textarea.value).toBe('Test description');
  });

  it('switches tool modes', () => {
    render(<TopologyEditor />, { wrapper: createWrapper() });
    
    const nodeButton = screen.getByTitle('Add Node');
    fireEvent.click(nodeButton);
    
    // The button should have the active class
    expect(nodeButton.className).toContain('bg-primary-100');
  });

  it('shows link mode instructions', () => {
    render(<TopologyEditor />, { wrapper: createWrapper() });
    
    const linkButton = screen.getByTitle('Add Link (click two nodes)');
    fireEvent.click(linkButton);
    
    expect(screen.getByText('Click source node')).toBeInTheDocument();
  });

  it('disables delete button when nothing selected', () => {
    render(<TopologyEditor />, { wrapper: createWrapper() });
    
    const deleteButton = screen.getByTitle('Delete Selected');
    expect(deleteButton).toBeDisabled();
  });
});
