'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  SparklesIcon,
  FileTextIcon,
  ComparisonIcon,
  PlusIcon,
  ArrowRightIcon,
  BarChart3Icon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AuthHeader } from '@/components/auth-header'
import { signOutAction } from '@/app/(main)/(auth)/actions'

// This will be a client component that fetches user data on mount
interface User {
  name: string
  email: string
  image?: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = React.useState<User | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    // Fetch user data from the session
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/session')
        if (response.ok) {
          const sessionData = await response.json()
          if (sessionData?.user) {
            setUser(sessionData.user)
          } else {
            // Redirect to login if no session
            router.push('/login')
          }
        } else {
          router.push('/login')
        }
      } catch (error) {
        console.error('Failed to fetch user:', error)
        router.push('/login')
      } finally {
        setIsLoading(false)
      }
    }

    fetchUser()
  }, [router])

  const handleSignOut = async () => {
    const result = await signOutAction()
    if (result.success) {
      router.push('/')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-lg animate-pulse mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Mock stats - these would come from your database
  const stats = {
    totalAnalyses: 24,
    documentsProcessed: 42,
    riskAlertsThis30Days: 8,
    avgAnalysisTime: '32s',
  }

  const recentActivity = [
    {
      id: 1,
      type: 'analysis',
      title: 'Master Service Agreement - Q4 Review',
      status: 'completed',
      timestamp: '2 hours ago',
      riskLevel: 'high',
    },
    {
      id: 2,
      type: 'document',
      title: 'Employee NDA Template Update',
      status: 'processing',
      timestamp: '1 day ago',
      riskLevel: 'medium',
    },
    {
      id: 3,
      type: 'comparison',
      title: 'Vendor Contract Comparison',
      status: 'completed',
      timestamp: '3 days ago',
      riskLevel: 'low',
    },
    {
      id: 4,
      type: 'analysis',
      title: 'Partnership Agreement Review',
      status: 'completed',
      timestamp: '1 week ago',
      riskLevel: 'medium',
    },
  ]

  const quickActions = [
    {
      icon: <SparklesIcon className="w-6 h-6" />,
      title: 'Analyze NDA',
      description: 'Upload and analyze a new contract',
      href: '/chat',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: <ComparisonIcon className="w-6 h-6" />,
      title: 'Compare Documents',
      description: 'Compare two contracts side-by-side',
      href: '/documents?action=compare',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: <FileTextIcon className="w-6 h-6" />,
      title: 'Generate NDA',
      description: 'Create a new NDA from templates',
      href: '/generate',
      color: 'from-amber-500 to-orange-500',
    },
    {
      icon: <BarChart3Icon className="w-6 h-6" />,
      title: 'View Reports',
      description: 'Analyze trends and insights',
      href: '/admin',
      color: 'from-green-500 to-emerald-500',
    },
  ]

  const recentActivity = [
    {
      id: 1,
      type: 'analysis',
      title: 'Master Service Agreement - Q4 Review',
      status: 'completed',
      timestamp: '2 hours ago',
      riskLevel: 'high',
    },
    {
      id: 2,
      type: 'document',
      title: 'Employee NDA Template Update',
      status: 'processing',
      timestamp: '1 day ago',
      riskLevel: 'medium',
    },
    {
      id: 3,
      type: 'comparison',
      title: 'Vendor Contract Comparison',
      status: 'completed',
      timestamp: '3 days ago',
      riskLevel: 'low',
    },
    {
      id: 4,
      type: 'analysis',
      title: 'Partnership Agreement Review',
      status: 'completed',
      timestamp: '1 week ago',
      riskLevel: 'medium',
    },
  ]

  const getRiskBadgeColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-red-100 text-red-700'
      case 'medium':
        return 'bg-amber-100 text-amber-700'
      default:
        return 'bg-green-100 text-green-700'
    }
  }

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircleIcon className="w-4 h-4" />
    if (status === 'processing') return <ClockIcon className="w-4 h-4 animate-spin" />
    return <AlertCircleIcon className="w-4 h-4" />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <AuthHeader
        userName={user.name}
        userEmail={user.email}
        userAvatar={user.image}
        onSignOut={handleSignOut}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Welcome Section */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Welcome back, {user.name.split(' ')[0]}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Here&apos;s your activity overview and quick actions
          </p>
        </div>
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  Total Analyses
                </p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {stats.totalAnalyses}
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900 dark:to-blue-800 rounded-lg flex items-center justify-center">
                <BarChart3Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  Documents Processed
                </p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {stats.documentsProcessed}
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900 dark:to-purple-800 rounded-lg flex items-center justify-center">
                <FileTextIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  Risk Alerts (30d)
                </p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {stats.riskAlertsThis30Days}
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900 dark:to-red-800 rounded-lg flex items-center justify-center">
                <AlertCircleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  Avg Analysis Time
                </p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                  {stats.avgAnalysisTime}
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-green-50 dark:from-green-900 dark:to-green-800 rounded-lg flex items-center justify-center">
                <ClockIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <Link key={action.title} href={action.href}>
                <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-xl transition-all duration-300 cursor-pointer group h-full">
                  <div
                    className={`w-12 h-12 bg-gradient-to-br ${action.color} rounded-lg flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}
                  >
                    {action.icon}
                  </div>
                  <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                    {action.description}
                  </p>
                  <div className="mt-4 flex items-center text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
                    <ArrowRightIcon className="w-4 h-4" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Recent Activity
            </h2>
            <Link href="/chat" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
              View All
            </Link>
          </div>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        {getStatusIcon(activity.status)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {activity.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {activity.timestamp}
                        </p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getRiskBadgeColor(activity.riskLevel)}`}
                      >
                        {activity.riskLevel}
                      </span>
                      <ArrowRightIcon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
