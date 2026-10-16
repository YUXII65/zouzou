/**
 * 访客账号的用户名以 guest_ 开头。
 * 这个判断不依赖 Next 运行时，单独放一个模块，供共享视图契约复用。
 */
export function isGuestUser(user: { username: string }) {
  return user.username.startsWith("guest_");
}