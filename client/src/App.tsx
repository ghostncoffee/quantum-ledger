import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Runs } from './pages/Runs';
import { RunDetail } from './pages/RunDetail';
import { Mining } from './pages/Mining';
import { Trading } from './pages/Trading';
import { Crafting } from './pages/Crafting';
import { Contracts } from './pages/Contracts';
import { Accounting } from './pages/Accounting';
import { Inventory } from './pages/Inventory';
import { Crew } from './pages/Crew';
import { CrewDetail } from './pages/CrewDetail';
import { Vehicles } from './pages/Vehicles';
import { Locations } from './pages/Locations';
import { Refining } from './pages/Refining';
import { Settings } from './pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15_000 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="runs" element={<Runs />} />
            <Route path="runs/:id" element={<RunDetail />} />
            <Route path="mining" element={<Mining />} />
            <Route path="refining" element={<Refining />} />
            <Route path="trading" element={<Trading />} />
            <Route path="crafting" element={<Crafting />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="accounting" element={<Accounting />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="locations" element={<Locations />} />
            <Route path="crew" element={<Crew />} />
            <Route path="crew/:id" element={<CrewDetail />} />
            <Route path="vehicles" element={<Vehicles />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
