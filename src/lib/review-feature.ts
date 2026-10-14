/**
 * 复盘暂时退出产品主链路。
 *
 * 这层开关只控制入口和挂载点；Review / ReviewTask / ReviewNextAction 的数据表、
 * 旧记录和后端函数都保留，后续恢复或迁移时不需要重建数据。
 */
export const REVIEW_ENABLED = false;
