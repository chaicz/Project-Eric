import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  MapPin,
  Link as LinkIcon,
  Calendar,
  Code2,
  Shield,
  Star,
  Award,
  TrendingUp,
  Users,
  Activity,
  Edit2,
  ExternalLink,
  Check,
  X,
  Loader2
} from 'lucide-react';
import { useToast } from '../components/Toast';
import PageTip from '../components/PageTip';

const Profile = () => {
  const { user, setUser } = useApp();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: user?.name || 'User',
    bio: 'Full-Stack Developer & Security Enthusiast',
    location: 'San Francisco, CA',
    website: 'portfolio.dev'
  });
  const [isSaving, setIsSaving] = useState(false);

  // Handle edit profile
  const handleEditProfile = () => {
    setEditForm({
      name: user?.name || 'User',
      bio: 'Full-Stack Developer & Security Enthusiast',
      location: 'San Francisco, CA',
      website: 'portfolio.dev'
    });
    setIsEditing(true);
  };

  // Handle save profile
  const handleSaveProfile = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (setUser) {
      setUser({ ...user, name: editForm.name });
    }
    setIsSaving(false);
    setIsEditing(false);
    showToast('Profile updated successfully!');
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  // Handle share profile
  const handleShareProfile = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${user?.name || 'User'}'s Profile`,
          text: 'Check out my security profile!',
          url: shareUrl
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Profile link copied to clipboard!');
      }
    } catch (err) {
      showToast('Failed to share profile', 'error');
    }
  };

  // Handle view all activity
  const handleViewAllActivity = () => {
    showToast('Opening full activity timeline...', 'info');
  };

  const stats = [
    { label: 'Vulnerabilities Fixed', value: '234', change: '+12%', positive: true },
    { label: 'Projects Scanned', value: '47', change: '+5', positive: true },
    { label: 'Lines of Code', value: '128K', change: '+8K', positive: true },
    { label: 'Threats Blocked', value: '1,892', change: '+23%', positive: true },
  ];

  const achievements = [
    { icon: Shield, name: 'Security Expert', desc: 'Fixed 100+ vulnerabilities', color: 'bg-blue-50 text-blue-600' },
    { icon: Star, name: 'Top Coder', desc: '10+ projects completed', color: 'bg-amber-50 text-amber-600' },
    { icon: Award, name: 'First Scan', desc: 'Completed first scan', color: 'bg-emerald-50 text-emerald-600' },
    { icon: TrendingUp, name: 'Rising Star', desc: 'Month-over-month growth', color: 'bg-violet-50 text-violet-600' },
  ];

  const recentActivity = [
    { type: 'scan', project: 'E-Commerce API', time: '2 hours ago', status: 'completed' },
    { type: 'fix', project: 'Auth Module', time: '5 hours ago', status: 'completed' },
    { type: 'alert', project: 'Payment Gateway', time: '1 day ago', status: 'warning' },
    { type: 'scan', project: 'Dashboard UI', time: '2 days ago', status: 'completed' },
  ];

  const teams = [
    { name: 'Backend Team', members: 8, role: 'Lead' },
    { name: 'Security Guild', members: 12, role: 'Member' },
  ];

  const getJoinedLabel = () => {
    if (user?.joinedAt) {
      try {
        const d = new Date(user.joinedAt);
        return `Joined ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
      } catch { /* fall through */ }
    }
    if (user?.createdAt) {
      try {
        const d = new Date(user.createdAt);
        return `Joined ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
      } catch { /* fall through */ }
    }
    return 'Member';
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Page Tip — first-time guidance */}
      <PageTip
        pageId="profile"
        variant="info"
        title="Your security profile"
        body="Showcase your wins — vulnerabilities fixed, projects scanned, and contributions to your team. Click 'Edit Profile' to update your details, or 'Share Profile' to send a public link."
      />
      {/* Header */}
      <div className="minimal-card overflow-hidden mb-6">
        {/* Cover */}
        <div className="h-24 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-800 dark:from-slate-800 dark:via-slate-700 dark:to-slate-900"></div>
        
        {/* Profile Info */}
        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12">
            {/* Avatar */}
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white text-3xl font-bold border-4 border-white dark:border-slate-900 shadow-lg">
                {user?.name?.[0] || 'U'}
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 border-4 border-white dark:border-slate-900 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="text-xl font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 w-full"
                  />
                  <input
                    type="text"
                    value={editForm.bio}
                    onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                    className="text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 w-full"
                  />
                  <input
                    type="text"
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    className="text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 w-full"
                  />
                  <input
                    type="text"
                    value={editForm.website}
                    onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                    className="text-sm text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 w-full"
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{user?.name || 'User'}</h1>
                    <span className="px-2 py-1 bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium rounded-full">PRO</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 mt-1">Full-Stack Developer & Security Enthusiast</p>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      San Francisco, CA
                    </span>
                    <span className="flex items-center gap-1">
                      <LinkIcon className="w-4 h-4" />
                      <a href="#" className="text-blue-600 hover:underline">portfolio.dev</a>
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {getJoinedLabel()}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            {!isEditing ? (
              <div className="flex gap-3">
                <button 
                  onClick={handleEditProfile}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Profile
                </button>
                <button 
                  onClick={handleShareProfile}
                  className="btn-primary"
                >
                  Share Profile
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button 
                  onClick={handleCancelEdit}
                  className="btn-secondary flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button 
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="btn-primary flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 border-t border-slate-100">
          <div className="flex gap-1">
            {['overview', 'projects', 'activity', 'teams'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 font-medium text-sm capitalize transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-500 border-transparent hover:text-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              {stats.map((stat, index) => (
                <div key={index} className="minimal-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Activity className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${stat.positive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {stat.change}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stat.value}</div>
                  <div className="text-sm text-slate-500">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Recent Activity */}
            <div className="minimal-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">Recent Activity</h3>
                <button 
                  onClick={handleViewAllActivity}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  View All
                </button>
              </div>
              <div className="space-y-3">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      activity.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {activity.type === 'scan' && <Code2 className="w-5 h-5" />}
                      {activity.type === 'fix' && <Shield className="w-5 h-5" />}
                      {activity.type === 'alert' && <Activity className="w-5 h-5" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{activity.project}</p>
                      <p className="text-sm text-slate-500 capitalize">{activity.type} · {activity.time}</p>
                    </div>
                    <span className={`minimal-badge ${
                      activity.status === 'completed' ? 'badge-success' : 'badge-warning'
                    }`}>
                      {activity.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Achievements */}
            <div className="minimal-card p-6">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Achievements</h3>
              <div className="space-y-3">
                {achievements.map((achievement, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <div className={`w-10 h-10 rounded-xl ${achievement.color} flex items-center justify-center`}>
                      <achievement.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{achievement.name}</p>
                      <p className="text-xs text-slate-500">{achievement.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Teams */}
            <div className="minimal-card p-6">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Teams</h3>
              <div className="space-y-3">
                {teams.map((team, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{team.name}</p>
                      <p className="text-xs text-slate-500">{team.members} members</p>
                    </div>
                    <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded-full">
                      {team.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Skills */}
            <div className="minimal-card p-6">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Security Skills</h3>
              <div className="flex flex-wrap gap-2">
                {['OWASP', 'Penetration Testing', 'SAST', 'DAST', 'Code Review', 'Threat Modeling'].map((skill) => (
                  <span key={skill} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="minimal-card p-12 text-center">
          <Code2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Project Activity</h3>
          <p className="text-slate-500">View all your scanned projects and their security status</p>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="minimal-card p-12 text-center">
          <Activity className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Activity Timeline</h3>
          <p className="text-slate-500">See your complete activity history</p>
        </div>
      )}

      {activeTab === 'teams' && (
        <div className="minimal-card p-12 text-center">
          <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Team Management</h3>
          <p className="text-slate-500">Manage your team members and permissions</p>
        </div>
      )}

      {/* No toast UI needed - using shared Toast */}
    </div>
  );
};

export default Profile;
