import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Search,
  Mail,
  Shield,
  MoreHorizontal,
  Crown,
  Edit2,
  Trash2,
  X,
  Loader2,
  Check
} from 'lucide-react';
import { useToast } from '../components/Toast';
import PageTip from '../components/PageTip';
import EmptyState from '../components/EmptyState';

const Team = () => {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [teamMembers, setTeamMembers] = useState([
    { 
      id: 1, 
      name: 'Sarah Chen', 
      email: 'sarah.chen@company.com',
      role: 'admin',
      status: 'online',
      avatar: 'SC',
      joinedAt: '2024-01-10',
      lastActive: 'Just now'
    },
    { 
      id: 2, 
      name: 'Marcus Johnson', 
      email: 'marcus.j@company.com',
      role: 'developer',
      status: 'online',
      avatar: 'MJ',
      joinedAt: '2024-01-12',
      lastActive: '5 min ago'
    },
    { 
      id: 3, 
      name: 'Emily Watson', 
      email: 'emily.w@company.com',
      role: 'analyst',
      status: 'offline',
      avatar: 'EW',
      joinedAt: '2024-01-14',
      lastActive: '2 hours ago'
    },
    { 
      id: 4, 
      name: 'Alex Kim', 
      email: 'alex.kim@company.com',
      role: 'developer',
      status: 'online',
      avatar: 'AK',
      joinedAt: '2024-01-15',
      lastActive: '1 hour ago'
    },
    { 
      id: 5, 
      name: 'Jordan Lee', 
      email: 'jordan.l@company.com',
      role: 'viewer',
      status: 'offline',
      avatar: 'JL',
      joinedAt: '2024-01-16',
      lastActive: '1 day ago'
    },
  ]);

  const [pendingInvites, setPendingInvites] = useState([
    { id: 1, email: 'new.user@company.com', role: 'developer', sentAt: '2024-01-16' },
    { id: 2, email: 'intern@company.com', role: 'viewer', sentAt: '2024-01-17' },
  ]);

  // Handle send invitation
  const handleSendInvitation = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      showToast('Please enter an email address', 'error');
      return;
    }
    
    setIsSending(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const newInvite = {
      id: Date.now(),
      email: inviteEmail,
      role: inviteRole,
      sentAt: new Date().toISOString().split('T')[0]
    };
    
    setPendingInvites(prev => [...prev, newInvite]);
    setInviteEmail('');
    setInviteRole('viewer');
    setShowInviteModal(false);
    setIsSending(false);
    showToast(`Invitation sent to ${newInvite.email}!`);
  };

  // Handle resend invitation
  const handleResendInvite = (invite) => {
    showToast(`Resending invitation to ${invite.email}...`, 'info');
    setTimeout(() => {
      showToast(`Invitation resent to ${invite.email}!`);
    }, 1000);
  };

  // Handle revoke invitation
  const handleRevokeInvite = (invite) => {
    if (window.confirm(`Revoke invitation for ${invite.email}?`)) {
      setPendingInvites(prev => prev.filter(i => i.id !== invite.id));
      showToast(`Invitation for ${invite.email} revoked`, 'info');
    }
  };

  // Handle remove member
  const handleRemoveMember = (member) => {
    if (window.confirm(`Remove ${member.name} from the team?`)) {
      setTeamMembers(prev => prev.filter(m => m.id !== member.id));
      showToast(`${member.name} has been removed from the team`, 'info');
    }
  };

  // Handle edit member
  const handleEditMember = (member) => {
    showToast(`Opening edit form for ${member.name}...`, 'info');
  };

  const roles = [
    { id: 'all', label: 'All Roles' },
    { id: 'admin', label: 'Admin' },
    { id: 'developer', label: 'Developer' },
    { id: 'analyst', label: 'Analyst' },
    { id: 'viewer', label: 'Viewer' },
  ];

  const filteredMembers = teamMembers.filter(member => {
    if (selectedRole !== 'all' && member.role !== selectedRole) return false;
    if (searchQuery && !member.name.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !member.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const roleConfig = {
    admin: { bg: 'bg-violet-50', text: 'text-violet-600', label: 'Admin' },
    developer: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Developer' },
    analyst: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Analyst' },
    viewer: { bg: 'bg-slate-50', text: 'text-slate-600', label: 'Viewer' },
  };

  const statusConfig = {
    online: 'bg-emerald-500',
    offline: 'bg-slate-300',
    busy: 'bg-amber-500',
  };

  return (
    <div className={`p-6 lg:p-8 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Page Tip — first-time guidance */}
      <PageTip
        pageId="team"
        variant="tip"
        title="Collaborate with your team"
        body="Invite colleagues by email and assign roles (Admin, Developer, Analyst, Viewer). Pending invitations show up below and can be resent or revoked."
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Team</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your team members and roles</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{teamMembers.length}</div>
          <div className="text-sm text-slate-500">Total Members</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-emerald-600">{teamMembers.filter(m => m.status === 'online').length}</div>
          <div className="text-sm text-slate-500">Online Now</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-violet-600">{teamMembers.filter(m => m.role === 'admin').length}</div>
          <div className="text-sm text-slate-500">Admins</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{pendingInvites.length}</div>
          <div className="text-sm text-slate-500">Pending Invites</div>
        </div>
      </div>

      {/* Filters */}
      <div className="minimal-card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search team members..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div className="flex gap-1">
            {roles.map(role => (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  selectedRole === role.id
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Team Members Table */}
      <div className="minimal-card overflow-hidden mb-6">
        {filteredMembers.length === 0 ? (
          <EmptyState
            icon={Users}
            iconColor="from-violet-500 to-purple-500"
            iconBg="bg-violet-50"
            title={searchQuery || selectedRole !== 'all' ? 'No team members match your filters' : 'Invite your first teammate'}
            description={searchQuery || selectedRole !== 'all'
              ? 'Try clearing filters or selecting a different role.'
              : 'Bring in your colleagues so you can collaborate on scans, share findings, and assign roles.'}
            primaryCta={searchQuery || selectedRole !== 'all'
              ? { label: 'Clear filters', onClick: () => { setSearchQuery(''); setSelectedRole('all'); } }
              : { label: 'Invite Member', onClick: () => setShowInviteModal(true) }}
          />
        ) : (
          <>
            <table className="minimal-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Active</th>
              <th>Joined</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((member) => {
              const role = roleConfig[member.role];
              return (
                <tr key={member.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white text-sm font-semibold">
                          {member.avatar}
                        </div>
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${statusConfig[member.status]}`} />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          {member.name}
                          {member.role === 'admin' && <Crown className="w-4 h-4 text-amber-500" />}
                        </div>
                        <div className="text-sm text-slate-500">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${role.bg} ${role.text}`}>
                      {role.label}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm text-slate-600 capitalize">{member.status}</span>
                  </td>
                  <td className="text-slate-500 text-sm">{member.lastActive}</td>
                  <td className="text-slate-500 text-sm">{new Date(member.joinedAt).toLocaleDateString()}</td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleEditMember(member)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Edit member"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleRemoveMember(member)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
          </>
        )}
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="minimal-card p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Pending Invitations</h2>
          <div className="space-y-3">
            {pendingInvites.map((invite) => {
              const role = roleConfig[invite.role];
              return (
                <div key={invite.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{invite.email}</div>
                      <div className="text-sm text-slate-500">
                        Invited as <span className={`font-medium ${role.text}`}>{role.label}</span> · {new Date(invite.sentAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleResendInvite(invite)}
                      className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      Resend
                    </button>
                    <button 
                      onClick={() => handleRevokeInvite(invite)}
                      className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md animate-scale-in">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Invite Team Member</h2>
              <button 
                onClick={() => setShowInviteModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSendInvitation} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Role</label>
                <select 
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  <option value="viewer">Viewer - Read-only access</option>
                  <option value="developer">Developer - Can run scans</option>
                  <option value="analyst">Analyst - Full analysis access</option>
                  <option value="admin">Admin - Full access</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSending}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Send Invitation
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* No toast UI needed - using shared Toast */}
    </div>
  );
};

export default Team;
