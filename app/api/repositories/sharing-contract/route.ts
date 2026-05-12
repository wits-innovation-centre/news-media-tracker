import { NextResponse } from 'next/server';
import { REPOSITORY_SHARING_PERMISSION_CONTRACT } from '../../../../lib/contracts/repository-sharing-permissions';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: REPOSITORY_SHARING_PERMISSION_CONTRACT,
  });
}
