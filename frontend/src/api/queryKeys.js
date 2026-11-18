// Single source of query keys. Add keys here before using them anywhere.
export const queryKeys = {
  me: () => ['me'],
  conversations: {
    all: () => ['conversations'],
    lists: () => ['conversations', 'list'],
    list: (q = '') => ['conversations', 'list', q],
    detail: (id) => ['conversations', 'detail', id],
    messages: (id) => ['conversations', id, 'messages'],
    readState: (id) => ['conversations', id, 'read-state'],
  },
  friends: {
    all: () => ['friends'],
    list: () => ['friends', 'list'],
    requests: () => ['friends', 'requests'],
  },
  users: { search: (q) => ['users', 'search', q] },
  presence: () => ['presence'],
  activity: {
    feed: () => ['activity', 'feed'],
    me: () => ['activity', 'me'],
  },
  focusRooms: {
    all: () => ['focus-rooms'],
    list: (scope) => ['focus-rooms', 'list', scope],
    detail: (id) => ['focus-rooms', 'detail', id],
  },
};
