type PersonIdentity = {
  name: string;
  linked_user_id?: string | null;
  isSelf?: boolean;
};

export function getPersonDisplayName(
  person: PersonIdentity,
  currentUserId?: string,
) {
  const isCurrentUser =
    person.isSelf === true ||
    (currentUserId && person.linked_user_id === currentUserId);

  return isCurrentUser ? "You" : person.name;
}
