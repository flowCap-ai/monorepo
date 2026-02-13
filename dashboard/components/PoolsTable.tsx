'use client';

import { useState, useEffect } from 'react';
import * as getPools from '@/lib/pools/getPools';
import * as analyzePoolModule from '@/lib/pools/analyzePool';
import type { Address } from 'viem';

interface Pool {
  poolId: string;
  protocol: string;
  name: string;
  assets: string[];
  type: string;
  address?: string;
  underlyingTokens?: string[];
  apy?: number;
  tvl?: number;
  riskScore?: number;
  riskLevel?: string;
}

interface PoolsTableProps {
  riskProfile: 'low' | 'medium' | 'high';
}

export function PoolsTable({ riskProfile }: PoolsTableProps) {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);

  // Fetch pools directly using the agent skills
  useEffect(() => {
    fetchPools();
  }, [riskProfile]);

  const fetchPools = async () => {
    setLoading(true);
    try {
      // Get all pools from the agent skills
      const allPools = await getPools.getAllPools();

      // Filter by risk profile
      const filteredPools = getPools.filterPoolsByRisk(allPools, riskProfile);

      // Convert to frontend format
      const poolsData = filteredPools.map(pool => ({
        poolId: pool.poolId,
        protocol: pool.protocol,
        name: pool.name,
        assets: pool.assets,
        type: pool.type,
        address: pool.address,
        underlyingTokens: pool.underlyingTokens,
      }));

      setPools(poolsData);
    } catch (error) {
      console.error('Error fetching pools:', error);
      setPools([]);
    } finally {
      setLoading(false);
    }
  };

  const analyzePool = async (poolId: string, poolAddress?: string) => {
    setAnalyzing(true);
    setSelectedPool(poolId);
    try {
      // Call the analyze function directly
      const analysis = await analyzePoolModule.analyzePool(
        poolId,
        poolAddress as Address | undefined
      );

      // Update pool with analysis data
      setPools(pools.map(p =>
        p.poolId === poolId
          ? {
              ...p,
              apy: analysis.apy,
              tvl: analysis.tvl,
              riskScore: analysis.riskScore,
              riskLevel: analysis.riskLevel
            }
          : p
      ));
    } catch (error) {
      console.error('Error analyzing pool:', error);
    } finally {
      setAnalyzing(false);
      setSelectedPool(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm p-8 rounded-lg border border-gray-700">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
          <span className="ml-3 text-gray-400">Loading pools...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
      <div className="p-6 border-b border-gray-700">
        <h3 className="text-xl font-semibold">Available Pools ({pools.length})</h3>
        <p className="text-sm text-gray-400 mt-1">
          Risk Profile: <span className="capitalize font-semibold text-purple-400">{riskProfile}</span>
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Pool
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Protocol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                APY
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Risk
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {pools.map((pool) => (
              <tr key={pool.poolId} className="hover:bg-gray-700/30 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium">{pool.name}</div>
                  <div className="text-sm text-gray-400">{pool.assets.join(', ')}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-900/50 text-purple-300">
                    {pool.protocol}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                  {pool.type}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {pool.apy !== undefined ? (
                    <span className="text-green-400 font-semibold">{pool.apy.toFixed(2)}%</span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {pool.riskScore !== undefined ? (
                    <div>
                      <div className="text-sm font-medium">{pool.riskScore}/100</div>
                      <div className={`text-xs ${
                        pool.riskLevel === 'low' ? 'text-green-400' :
                        pool.riskLevel === 'medium' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {pool.riskLevel}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => analyzePool(pool.poolId, pool.address)}
                    disabled={analyzing && selectedPool === pool.poolId}
                    className="px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {analyzing && selectedPool === pool.poolId ? 'Analyzing...' : 'Analyze'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pools.length === 0 && (
        <div className="p-8 text-center text-gray-400">
          No pools found for this risk profile
        </div>
      )}
    </div>
  );
}
