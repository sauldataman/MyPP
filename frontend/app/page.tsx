'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Status {
  env: string;
  agents: string[];
  llm_providers: string[];
  database: string;
}

interface Agent {
  name: string;
  last_run: string | null;
  run_count: number;
}

export default function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
    fetchAgents();
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch(`${API_URL}/status`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }

  async function fetchAgents() {
    try {
      const res = await fetch(`${API_URL}/agents`);
      const data = await res.json();
      setAgents(data.agents);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }

  async function runAgent(domain: string) {
    setRunningAgent(domain);
    try {
      await fetch(`${API_URL}/agents/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
      // Refresh after a delay
      setTimeout(() => {
        fetchAgents();
        setRunningAgent(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to run agent:', err);
      setRunningAgent(null);
    }
  }

  async function runAll() {
    setRunningAgent('all');
    try {
      await fetch(`${API_URL}/agents/run-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parallel: true })
      });
      setTimeout(() => {
        fetchAgents();
        setRunningAgent(null);
      }, 5000);
    } catch (err) {
      console.error('Failed to run all:', err);
      setRunningAgent(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Personal Panopticon</h1>
          <p className="text-gray-400">Your cognitive infrastructure dashboard</p>
        </header>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Environment</div>
            <div className="text-2xl font-bold">{status?.env || '-'}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Agents</div>
            <div className="text-2xl font-bold">{status?.agents.length || 0}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm">LLM Providers</div>
            <div className="text-2xl font-bold">{status?.llm_providers.length || 0}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Database</div>
            <div className="text-2xl font-bold">{status?.database || '-'}</div>
          </div>
        </div>

        {/* Run All Button */}
        <div className="mb-6">
          <button
            onClick={runAll}
            disabled={runningAgent !== null}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-3 rounded-lg font-medium transition-colors"
          >
            {runningAgent === 'all' ? 'Running...' : 'Run All Agents'}
          </button>
        </div>

        {/* Agents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div key={agent.name} className="bg-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold capitalize">{agent.name}</h3>
                  <p className="text-gray-400 text-sm">
                    {agent.run_count} runs
                  </p>
                </div>
                <button
                  onClick={() => runAgent(agent.name)}
                  disabled={runningAgent !== null}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-3 py-1 rounded text-sm transition-colors"
                >
                  {runningAgent === agent.name ? '...' : 'Run'}
                </button>
              </div>
              <div className="text-gray-500 text-xs">
                Last run: {agent.last_run || 'Never'}
              </div>
            </div>
          ))}
        </div>

        {/* LLM Providers */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">LLM Providers</h2>
          <div className="flex gap-2">
            {status?.llm_providers.map((provider) => (
              <span
                key={provider}
                className="bg-green-600/20 text-green-400 px-3 py-1 rounded-full text-sm"
              >
                {provider}
              </span>
            ))}
            {(!status?.llm_providers || status.llm_providers.length === 0) && (
              <span className="text-gray-500">No providers configured</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
