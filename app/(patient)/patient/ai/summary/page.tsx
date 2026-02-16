'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ============================================================================
// TYPES
// ============================================================================

interface HealthInsight {
  id: string
  type: 'positive' | 'warning' | 'info' | 'action'
  title: string
  description: string
  metric?: string
  trend?: 'up' | 'down' | 'stable'
  actionUrl?: string
  actionLabel?: string
}

interface HealthScore {
  overall: number
  categories: {
    name: string
    score: number
    icon: string
    color: string
  }[]
}

interface TrendData {
  label: string
  current: number
  previous: number
  unit: string
  status: 'improved' | 'declined' | 'stable'
}

// ============================================================================
// MOCK DATA GENERATOR
// ============================================================================

function generateMockHealthData() {
  const healthScore: HealthScore = {
    overall: 78,
    categories: [
      { name: 'Medication Adherence', score: 92, icon: '💊', color: 'bg-green-500' },
      { name: 'Activity Level', score: 65, icon: '🏃', color: 'bg-yellow-500' },
      { name: 'Sleep Quality', score: 72, icon: '😴', color: 'bg-blue-500' },
      { name: 'Mental Wellness', score: 80, icon: '🧘', color: 'bg-purple-500' },
      { name: 'Vital Signs', score: 85, icon: '❤️', color: 'bg-red-500' },
    ]
  }

  const insights: HealthInsight[] = [
    {
      id: '1',
      type: 'positive',
      title: 'Great medication adherence!',
      description: 'You\'ve taken 92% of your medications on time this month. Keep it up!',
      metric: '92%',
      trend: 'up'
    },
    {
      id: '2',
      type: 'warning',
      title: 'Sleep could be better',
      description: 'Your average sleep this week is 6.2 hours. Adults need 7-9 hours for optimal health.',
      metric: '6.2h avg',
      trend: 'down',
      actionUrl: '/patient/diary',
      actionLabel: 'Track Sleep'
    },
    {
      id: '3',
      type: 'info',
      title: 'HbA1c trending down',
      description: 'Your last HbA1c was 6.8%, down from 7.2% three months ago. Your diabetes management is improving.',
      metric: '6.8%',
      trend: 'down'
    },
    {
      id: '4',
      type: 'action',
      title: 'Cholesterol check due',
      description: 'It\'s been 6 months since your last lipid panel. Consider scheduling a follow-up.',
      actionUrl: '/patient/appointments',
      actionLabel: 'Book Appointment'
    },
    {
      id: '5',
      type: 'positive',
      title: 'Mood improving',
      description: 'Your diary entries show a positive trend in mood over the past 2 weeks.',
      metric: '4.2/5',
      trend: 'up'
    }
  ]

  const trends: TrendData[] = [
    { label: 'Blood Pressure', current: 128, previous: 135, unit: 'mmHg', status: 'improved' },
    { label: 'Weight', current: 75.2, previous: 76.1, unit: 'kg', status: 'improved' },
    { label: 'Resting Heart Rate', current: 72, previous: 70, unit: 'bpm', status: 'stable' },
    { label: 'Daily Steps (avg)', current: 5200, previous: 4800, unit: 'steps', status: 'improved' },
  ]

  return { healthScore, insights, trends }
}

// ============================================================================
// COMPONENTS
// ============================================================================

function HealthScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (score / 100) * circumference

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e' // green
    if (score >= 60) return '#eab308' // yellow
    if (score >= 40) return '#f97316' // orange
    return '#ef4444' // red
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getScoreColor(score)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-900">{score}</span>
        <span className="text-xs text-gray-500">Health Score</span>
      </div>
    </div>
  )
}

function InsightCard({ insight }: { insight: HealthInsight }) {
  const typeStyles = {
    positive: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200',
    action: 'bg-purple-50 border-purple-200'
  }

  const typeIcons = {
    positive: '✅',
    warning: '⚠️',
    info: 'ℹ️',
    action: '📋'
  }

  const trendIcons = {
    up: '📈',
    down: '📉',
    stable: '➡️'
  }

  return (
    <div className={`p-4 rounded-xl border-2 ${typeStyles[insight.type]}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl">{typeIcons[insight.type]}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{insight.title}</h3>
            {insight.metric && (
              <span className="px-2 py-0.5 bg-white rounded-full text-sm font-medium flex items-center gap-1">
                {insight.metric}
                {insight.trend && <span>{trendIcons[insight.trend]}</span>}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
          {insight.actionUrl && (
            <Link
              href={insight.actionUrl}
              className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              {insight.actionLabel} →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function TrendCard({ trend }: { trend: TrendData }) {
  const change = trend.current - trend.previous
  const percentChange = ((change / trend.previous) * 100).toFixed(1)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-sm text-gray-500 mb-1">{trend.label}</div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-2xl font-bold text-gray-900">{trend.current}</span>
          <span className="text-sm text-gray-500 ml-1">{trend.unit}</span>
        </div>
        <div className={`text-sm font-medium flex items-center gap-1 ${
          trend.status === 'improved' ? 'text-green-600' :
          trend.status === 'declined' ? 'text-red-600' :
          'text-gray-500'
        }`}>
          {trend.status === 'improved' ? '↓' : trend.status === 'declined' ? '↑' : '→'}
          {Math.abs(change).toFixed(1)} ({Math.abs(Number(percentChange))}%)
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function AIHealthSummaryPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<ReturnType<typeof generateMockHealthData> | null>(null)
  const [activeSection, setActiveSection] = useState<'insights' | 'trends' | 'recommendations'>('insights')

  useEffect(() => {
    // Simulate AI analysis loading
    const timer = setTimeout(() => {
      setData(generateMockHealthData())
      setIsLoading(false)
    }, 1500)
    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <span className="text-3xl animate-pulse">🌟</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Analyzing your health data...</h2>
          <p className="text-gray-500 mt-2">Shefa is reviewing your records</p>
          <div className="mt-6 flex justify-center gap-1">
            <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            🌟 AI Health Summary
          </h1>
          <p className="text-gray-600 mt-1">
            Personalized insights from Shefa
          </p>
        </div>
        <div className="text-sm text-gray-500">
          Last updated: {new Date().toLocaleDateString()}
        </div>
      </div>

      {/* Health Score Overview */}
      <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl p-6 border border-primary-200">
        <div className="flex items-center gap-8">
          <HealthScoreRing score={data.healthScore.overall} size={140} />
          
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Health Score Breakdown</h2>
            <div className="space-y-3">
              {data.healthScore.categories.map((cat) => (
                <div key={cat.name} className="flex items-center gap-3">
                  <span className="text-lg">{cat.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700">{cat.name}</span>
                      <span className="font-medium">{cat.score}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${cat.color} transition-all duration-1000`}
                        style={{ width: `${cat.score}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'insights', label: 'Key Insights', icon: '💡' },
          { id: 'trends', label: 'Health Trends', icon: '📊' },
          { id: 'recommendations', label: 'Recommendations', icon: '✨' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            className={`px-4 py-2 border-b-2 transition-colors flex items-center gap-2 ${
              activeSection === tab.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Insights Section */}
      {activeSection === 'insights' && (
        <div className="space-y-4">
          {data.insights.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}

      {/* Trends Section */}
      {activeSection === 'trends' && (
        <div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {data.trends.map((trend, i) => (
              <TrendCard key={i} trend={trend} />
            ))}
          </div>
          
          {/* Mock Chart Placeholder */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">30-Day Health Trend</h3>
            <div className="h-48 bg-gradient-to-t from-primary-50 to-white rounded-lg flex items-end justify-around p-4">
              {[65, 70, 68, 75, 72, 78, 76, 80, 78, 82].map((val, i) => (
                <div 
                  key={i}
                  className="w-8 bg-primary-500 rounded-t-lg transition-all hover:bg-primary-600"
                  style={{ height: `${val}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>3 weeks ago</span>
              <span>2 weeks ago</span>
              <span>Last week</span>
              <span>This week</span>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations Section */}
      {activeSection === 'recommendations' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span>🎯</span> Personalized Goals
            </h3>
            <div className="space-y-4">
              {[
                { 
                  goal: 'Improve sleep to 7+ hours', 
                  progress: 60, 
                  tip: 'Try setting a consistent bedtime and avoiding screens 1 hour before sleep.' 
                },
                { 
                  goal: 'Walk 7,000 steps daily', 
                  progress: 74, 
                  tip: 'You\'re averaging 5,200 steps. Try a 15-minute walk after lunch.' 
                },
                { 
                  goal: 'Take medications on time', 
                  progress: 92, 
                  tip: 'Excellent! Keep using your medication reminders.' 
                },
              ].map((item, i) => (
                <div key={i} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{item.goal}</span>
                    <span className={`text-sm font-medium ${
                      item.progress >= 80 ? 'text-green-600' : 
                      item.progress >= 50 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {item.progress}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div 
                      className={`h-full rounded-full ${
                        item.progress >= 80 ? 'bg-green-500' : 
                        item.progress >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600">💡 {item.tip}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-6">
            <h3 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
              <span>🌟</span> Shefa's Top Recommendation
            </h3>
            <p className="text-purple-800">
              Based on your health data, focusing on <strong>improving sleep quality</strong> would 
              have the biggest positive impact on your overall health. Better sleep can help with 
              blood sugar control, mood, and energy levels.
            </p>
            <Link
              href="/patient/diary"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <span>📔</span> Start Sleep Tracking
            </Link>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
        <p className="font-medium mb-1">⚕️ AI Health Summary Disclaimer</p>
        <p>
          This summary is generated by AI based on your health data and is for informational 
          purposes only. It does not constitute medical advice. Always consult your healthcare 
          provider for medical decisions.
        </p>
      </div>
    </div>
  )
}
