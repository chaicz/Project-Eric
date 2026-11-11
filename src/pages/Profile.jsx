import React, { useState, useEffect } from 'react';
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
import { dashboardAPI, resolveAssetUrl } from '../services/api';

const Profile = () => {
  const { user, setUser } = useApp();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  // The account's own details. There is no demo persona any more: a
  // new account starts with a name and nothing else.
  const [editForm, setEditForm] = useState({
    name: user?.name || '',
    bio: '',
    location: '',
    website: ''
  });
  const [profileData, setProfileData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  // The picture the account uploaded, shown in the header.
  const [avatarUrl, setAvatarUrl] = useState(resolveAssetUrl(user?.avatar));

  // The data behind the Projects, Activity and Teams tabs. Each one
  // used to be an empty placeholder while the information was already
  // sitting in the API response.
  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dashboardAPI
      .getProfile()
      .then((data) => {
        if (cancelled) return;
        setProfileData(data);
        if (data?.user) {
          setEditForm({
            name: data.user.name || '',
            bio: data.user.bio || '',
            location: data.user.company || '',
            website: data.user.username || ''
          });
          if (data.user.avatar) {
            setAvatarUrl(resolveAssetUrl(data.user.avatar));
          }
        }
      })
      .catch(() => {
        /* the backend is unreachable — keep what we have */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The projects behind the Projects tab.
  useEffect(() => {
    let cancelled = false;
    setIsLoadingProjects(true);
    dashboardAPI
      .getProjects()
      .then((data) => {
        if (cancelled) return;
        setProjects(Array.isArray(data?.projects) ? data.projects : []);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The roster behind the Teams tab.
  useEffect(() => {
    let cancelled = false;
    setIsLoadingTeam(true);
    dashboardAPI
      .getTeamMembers()
      .then((data) => {
        if (cancelled) return;
        setTeamMembers(Array.isArray(data?.members) ? data.members : []);
        setTeamName(data?.team?.name || '');
      })
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTeam(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle edit profile.
  //
  // The form is seeded from what the API returned, not from the cached
  // user object. The cached object only has a name, so seeding from it
  // used to blank out the bio, company and username that were already
  // loaded — and the next save wrote those empty values to the
  // database.
  const handleEditProfile = () => {
    const loaded = profileData?.user;
    setEditForm({
      name: loaded?.name || user?.name || '',
      bio: loaded?.bio || '',
      location: loaded?.company || '',
      website: loaded?.username || ''
    });
    setIsEditing(true);
  };

  // Handle save profile
  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const saved = await dashboardAPI.saveProfile({
        name: editForm.name,
        bio: editForm.bio,
        username: editForm.website,
        company: editForm.location
      });
      if (saved?.user && setUser && user) {
        setUser({ ...user, ...saved.user });
        // The header reads from `profileData`, so it has to be updated
        // too — otherwise the saved values only appear after a reload.
        setProfileData((prev) =>
          prev ? { ...prev, user: { ...prev.user, ...saved.user } } : prev
        );
      }
      showToast('Profile updated successfully!', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(err?.message || 'Could not save the profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  // Handle share profile.
  //
  // `navigator.share` rejects with an AbortError when the user closes
  // the share sheet without sharing. That is not a failure worth
  // reporting, so it is swallowed.
  const handleShareProfile = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${user?.name || 'User'}'s Profile`,
          text: 'Check out my security profile!',
          url: shareUrl
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Profile link copied to clipboard!', 'success');
      } else {
        showToast('Sharing is not supported in this browser', 'error');
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      showToast('Failed to share profile', 'error');
    }
  };

  // Handle view all activity — the full timeline lives on the Activity
  // tab, so the button switches to it.
  const handleViewAllActivity = () => {
    setActiveTab('activity');
  };

  // The numbers below are counted from this account's own projects, scans
  // and findings. They used to be fixed values (234 fixed, 47 projects,
  // 128K lines) shown to every account, including a brand-new one.
  const accountStats = profileData?.stats || null;

  const stats = [
    { label: 'Vulnerabilities Fixed', value: String(accountStats?.findingsFixed ?? 0), positive: true },
    { label: 'Projects Scanned', value: String(accountStats?.projects ?? 0), positive: true },
    { label: 'Lines of Code', value: String(accountStats?.linesAnalyzed ?? 0), positive: true },
    { label: 'Open Findings', value: String((accountStats?.findings ?? 0) - (accountStats?.findingsFixed ?? 0)), positive: true },
  ];

  // Achievements are earned, so each one is shown only once the account
  // has actually done the thing.
  const achievements = [
    accountStats?.findingsFixed >= 1 && {
      icon: Shield,
      name: 'First Fix',
      desc: 'Resolved your first finding',
      color: 'bg-blue-50 text-blue-600'
    },
    accountStats?.scans >= 1 && {
      icon: Award,
      name: 'First Scan',
      desc: 'Completed your first scan',
      color: 'bg-emerald-50 text-emerald-600'
    },
    accountStats?.projects >= 3 && {
      icon: Star,
      name: 'Top Coder',
      desc: 'Scanned 3 or more projects',
      color: 'bg-amber-50 text-amber-600'
    },
    accountStats?.findingsFixed >= 10 && {
      icon: TrendingUp,
      name: 'Rising Star',
      desc: 'Resolved 10 or more findings',
      color: 'bg-violet-50 text-violet-600'
    },
  ].filter(Boolean);

  const recentActivity = (profileData?.activity || []).map((a) => ({
    type: a.type,
    project: a.project,
    time: a.time,
    status: a.status,
  }));

  const teams = profileData?.teams || [];

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
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={user?.name || 'Profile picture'}
                  className="w-24 h-24 rounded-2xl object-cover border-4 border-white dark:border-slate-900 shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white text-3xl font-bold border-4 border-white dark:border-slate-900 shadow-lg">
                  {user?.name?.[0] || 'U'}
                </div>
              )}
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 border-4 border-white dark:border-slate-900 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="text-xl font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Bio</label>
                    <input
                      type="text"
                      value={editForm.bio}
                      onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                      className="text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 w-full"
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Company</label>
                      <input
                        type="text"
                        value={editForm.location}
                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                        className="text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 w-full"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Username</label>
                      <input
                        type="text"
                        value={editForm.website}
                        onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                        className="text-sm text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 w-full"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{user?.name || 'User'}</h1>
                    <span className="px-2 py-1 bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium rounded-full">PRO</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 mt-1">
                    {profileData?.user?.bio || 'Security-first developer'}
                  </p>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-500">
                    {profileData?.user?.company && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {profileData.user.company}
                      </span>
                    )}
                    {profileData?.user?.username && (
                      <span className="flex items-center gap-1">
                        <LinkIcon className="w-4 h-4" />
                        <span className="text-blue-600">{profileData.user.username}</span>
                      </span>
                    )}
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
                      {stat.change || 'Live'}
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
                {recentActivity.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No scans yet. Run an OWASP scan and it shows up here.
                  </p>
                )}
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
                {achievements.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No achievements yet. They unlock as you scan and fix findings.
                  </p>
                )}
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
                {teams.length === 0 && (
                  <p className="text-sm text-slate-500">
                    You are not in a team yet. Invite colleagues from the Team page.
                  </p>
                )}
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
        <div className="minimal-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Project Activity
              </h3>
              <p className="text-sm text-slate-500">
                {isLoadingProjects
                  ? 'Loading your projects...'
                  : `${projects.length} project${projects.length === 1 ? '' : 's'} in your account`}
              </p>
            </div>
          </div>

          {projects.length === 0 && !isLoadingProjects && (
            <p className="text-sm text-slate-500">
              No projects yet. Scan a project and it shows up here.
            </p>
          )}

          <div className="space-y-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {project.name}
                  </p>
                  <p className="text-sm text-slate-500 truncate">
                    {project.description || project.language || 'No description'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {project.lastModified
                      ? `Last modified ${new Date(project.lastModified).toLocaleDateString()}`
                      : 'Never scanned'}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-slate-500">
                    {project.vulnerabilityCount ?? 0} findings
                  </span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                      project.threatLevel === 'critical'
                        ? 'bg-red-50 text-red-600'
                        : project.threatLevel === 'high'
                          ? 'bg-amber-50 text-amber-600'
                          : project.threatLevel === 'medium'
                            ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {project.threatLevel || 'unknown'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="minimal-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Activity className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Activity Timeline
              </h3>
              <p className="text-sm text-slate-500">
                Every scan and fix recorded on your account
              </p>
            </div>
          </div>

          {recentActivity.length === 0 && (
            <p className="text-sm text-slate-500">
              No scans yet. Run an OWASP scan and it shows up here.
            </p>
          )}

          <div className="space-y-3">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    activity.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {activity.type === 'scan' && <Code2 className="w-5 h-5" />}
                  {activity.type === 'fix' && <Shield className="w-5 h-5" />}
                  {activity.type === 'alert' && <Activity className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {activity.project}
                  </p>
                  <p className="text-sm text-slate-500 capitalize">
                    {activity.type} · {activity.time}
                  </p>
                </div>
                <span
                  className={`minimal-badge shrink-0 ${
                    activity.status === 'completed' ? 'badge-success' : 'badge-warning'
                  }`}
                >
                  {activity.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'teams' && (
        <div className="minimal-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Team Members
              </h3>
              <p className="text-sm text-slate-500">
                {isLoadingTeam
                  ? 'Loading your team...'
                  : teamName
                    ? `${teamName} · ${teamMembers.length} member${teamMembers.length === 1 ? '' : 's'}`
                    : 'Your team'}
              </p>
            </div>
          </div>

          {teamMembers.length === 0 && !isLoadingTeam && (
            <p className="text-sm text-slate-500">
              You are not in a team yet. Invite colleagues from the Team page.
            </p>
          )}

          <div className="space-y-3">
            {teamMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60"
              >
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 font-semibold text-sm">
                  {member.initials || member.name?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {member.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{member.email}</p>
                </div>
                <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded-full capitalize shrink-0">
                  {member.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No toast UI needed - using shared Toast */}
    </div>
  );
};

export default Profile;
