'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Status {
  env: string;
  llmProviders: string[];
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  scheduler: {
    jobs: number;
    running: number;
  };
}

interface Agent {
  name: string;
  description: string;
  enabled: boolean;
  schedule: string | null;
  lastRun: string | null;
  lastStatus: string | null;
}

interface Job {
  id: string;
  name: string;
  data: { agentName: string; triggeredBy: string };
  result?: { status: string; brief?: string };
  failedReason?: string;
  progress: number;
  attempts: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

export default function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [jobs, setJobs] = useState<{ active: Job[]; completed: Job[]; failed: Job[] }>({
    active: [],
    completed: [],
    failed: [],
  });
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'agents' | 'jobs' | 'llm'>('agents');

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, agentsRes, jobsRes] = await Promise.all([
        fetch(`${API_URL}/status`),
        fetch(`${API_URL}/agents`),
        fetch(`${API_URL}/jobs/recent`),
      ]);

      if (statusRes.ok) setStatus(await statusRes.json());
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || []);
      }
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobs({
          active: data.active || [],
          completed: data.completed || [],
          failed: data.failed || [],
        });
      }
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, [fetchAll]);

  async function runAgent(name: string) {
    setRunningAgent(name);
    try {
      await fetch(`${API_URL}/agents/${name}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setTimeout(fetchAll, 1000);
    } catch (err) {
      console.error('Failed to run agent:', err);
    } finally {
      setTimeout(() => setRunningAgent(null), 2000);
    }
  }

  async function runAll() {
    setRunningAgent('all');
    try {
      await fetch(`${API_URL}/agents/run-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setTimeout(fetchAll, 1000);
    } catch (err) {
      console.error('Failed to run all:', err);
    } finally {
      setTimeout(() => setRunningAgent(null), 3000);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-xl animate-pulse">Loading Panopticon...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Personal Panopticon</h1>
            <p className="text-gray-500 text-sm">Cognitive Infrastructure Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            <span className={`px-2 py-1 rounded text-xs ${
              status?.env === 'production' ? 'bg-green-600' : 'bg-yellow-600'
            }`}>
              {status?.env || 'unknown'}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatCard label="Agents" value={agents.length} />
          <StatCard
            label="Queue Active"
            value={status?.queue.active || 0}
            color={status?.queue.active ? 'yellow' : undefined}
          />
          <StatCard
            label="Completed Today"
            value={status?.queue.completed || 0}
            color="green"
          />
          <StatCard
            label="Failed"
            value={status?.queue.failed || 0}
            color={status?.queue.failed ? 'red' : undefined}
          />
          <StatCard
            label="Scheduled Jobs"
            value={status?.scheduler.jobs || 0}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['agents', 'jobs', 'llm'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Agents Tab */}
        {activeTab === 'agents' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Agents</h2>
              <button
                onClick={runAll}
                disabled={runningAgent !== null}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {runningAgent === 'all' ? 'Starting...' : 'Run All'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-bold capitalize">{agent.name}</h3>
                      <p className="text-gray-500 text-sm">{agent.description}</p>
                    </div>
                    <StatusBadge status={agent.lastStatus} />
                  </div>

                  {agent.schedule && (
                    <div className="text-xs text-gray-500 mb-2">
                      Schedule: <code className="bg-gray-800 px-1 rounded">{agent.schedule}</code>
                    </div>
                  )}

                  <div className="flex justify-between items-center mt-4">
                    <span className="text-xs text-gray-500">
                      {agent.lastRun
                        ? `Last: ${formatDistanceToNow(new Date(agent.lastRun))} ago`
                        : 'Never run'}
                    </span>
                    <button
                      onClick={() => runAgent(agent.name)}
                      disabled={runningAgent !== null}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-3 py-1 rounded text-sm transition-colors"
                    >
                      {runningAgent === agent.name ? '...' : 'Run'}
                    </button>
                  </div>
                </div>
              ))}

              {agents.length === 0 && (
                <div className="col-span-full text-center text-gray-500 py-8">
                  No agents registered
                </div>
              )}
            </div>
          </div>
        )}

        {/* Jobs Tab */}
        {activeTab === 'jobs' && (
          <div>
            <h2 className="text-xl font-bold mb-4">Job Queue</h2>

            {/* Active Jobs */}
            {jobs.active.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-yellow-400 mb-2">Active ({jobs.active.length})</h3>
                <div className="space-y-2">
                  {jobs.active.map((job) => (
                    <JobCard key={job.id} job={job} status="active" />
                  ))}
                </div>
              </div>
            )}

            {/* Recent Completed */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-green-400 mb-2">
                Recent Completed ({jobs.completed.length})
              </h3>
              <div className="space-y-2">
                {jobs.completed.slice(0, 10).map((job) => (
                  <JobCard key={job.id} job={job} status="completed" />
                ))}
                {jobs.completed.length === 0 && (
                  <div className="text-gray-500 text-sm">No completed jobs</div>
                )}
              </div>
            </div>

            {/* Failed Jobs */}
            {jobs.failed.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-400 mb-2">Failed ({jobs.failed.length})</h3>
                <div className="space-y-2">
                  {jobs.failed.slice(0, 5).map((job) => (
                    <JobCard key={job.id} job={job} status="failed" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LLM Tab */}
        {activeTab === 'llm' && (
          <div>
            <h2 className="text-xl font-bold mb-4">LLM Providers</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['gemini', 'grok', 'claude', 'ollama'].map((provider) => {
                const isAvailable = status?.llmProviders.includes(provider);
                return (
                  <div
                    key={provider}
                    className={`p-4 rounded-lg border ${
                      isAvailable
                        ? 'bg-green-900/20 border-green-800'
                        : 'bg-gray-900 border-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isAvailable ? 'bg-green-500' : 'bg-gray-600'
                        }`}
                      />
                      <span className="font-medium capitalize">{provider}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {isAvailable ? 'Configured' : 'Not configured'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: 'green' | 'yellow' | 'red';
}) {
  const colorClass = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  }[color || ''] || 'text-white';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-gray-500 text-xs uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const colors = {
    success: 'bg-green-600',
    failed: 'bg-red-600',
    running: 'bg-yellow-600',
    pending: 'bg-gray-600',
  };

  if (!status) return null;

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs ${
        colors[status as keyof typeof colors] || 'bg-gray-600'
      }`}
    >
      {status}
    </span>
  );
}

function JobCard({ job, status }: { job: Job; status: 'active' | 'completed' | 'failed' }) {
  const borderColor = {
    active: 'border-yellow-800',
    completed: 'border-green-800',
    failed: 'border-red-800',
  }[status];

  return (
    <div className={`bg-gray-900 border ${borderColor} rounded-lg p-3`}>
      <div className="flex justify-between items-start">
        <div>
          <span className="font-medium">{job.data.agentName}</span>
          <span className="text-gray-500 text-xs ml-2">({job.data.triggeredBy})</span>
        </div>
        <span className="text-xs text-gray-500">
          {job.finishedOn
            ? formatDistanceToNow(new Date(job.finishedOn)) + ' ago'
            : job.processedOn
            ? 'Running...'
            : 'Queued'}
        </span>
      </div>

      {status === 'active' && (
        <div className="mt-2">
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-500 transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      )}

      {status === 'failed' && job.failedReason && (
        <div className="mt-2 text-xs text-red-400 truncate">{job.failedReason}</div>
      )}

      {status === 'completed' && job.result?.brief && (
        <div className="mt-2 text-xs text-gray-400 line-clamp-2">{job.result.brief}</div>
      )}
    </div>
  );
}
