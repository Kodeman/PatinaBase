'use client';

import { useAuth } from '@/hooks/use-auth';
import { Card } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { User, Mail, Shield, Calendar } from 'lucide-react';
import { getInitials, formatDate } from '@/lib/utils';
import { getUserPermissions } from '@/lib/rbac';

export default function ProfilePage() {
  const { user, session } = useAuth();

  if (!user) {
    return null;
  }

  const permissions = getUserPermissions(session);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">
          View and manage your profile information
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Card */}
        <Card className="md:col-span-1">
          <div className="p-6">
            <div className="flex flex-col items-center space-y-4">
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.name}
                  className="h-24 w-24 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  {getInitials(user.name || user.email)}
                </div>
              )}
              <div className="text-center">
                <h2 className="text-xl font-semibold">{user.name}</h2>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {user.roles?.map((role) => (
                  <Badge key={role} variant="subtle" color="neutral">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Information Card */}
        <Card className="md:col-span-2">
          <div className="p-6">
            <h3 className="mb-4 text-lg font-semibold">Account Information</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <User className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Full Name</p>
                  <p className="text-sm text-muted-foreground">{user.name}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Email Address</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Roles</p>
                  <p className="text-sm text-muted-foreground">
                    {user.roles?.join(', ') || 'No roles assigned'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Session Expires</p>
                  <p className="text-sm text-muted-foreground">
                    {session?.expiresAt ? formatDate(new Date(session.expiresAt)) : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Permissions Card */}
      <Card>
        <div className="p-6">
          <h3 className="mb-4 text-lg font-semibold">Permissions</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {permissions.map((permission) => (
              <div
                key={permission}
                className="flex items-center gap-2 rounded-md border p-2 text-sm"
              >
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">{permission}</span>
              </div>
            ))}
          </div>
          {permissions.length === 0 && (
            <p className="text-sm text-muted-foreground">No permissions assigned</p>
          )}
        </div>
      </Card>
    </div>
  );
}
