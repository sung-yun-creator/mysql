import express from 'express';
import Logger from '../logger.js'
import { getWorkoutDetails, getWorkoutHistory, getWorkouts, initWorkoutRecord, insertWorkoutRecord, completeWorkoutRecord } from '../db.js';
import { T_WORKOUT_RECORD, Workout, WorkoutDetail } from 'shared';

const workoutRouter = express.Router();

workoutRouter.get('/getWorkoutDetails', async (req, res) => {
  let apiLogEntry = null;
  try {
    let { mem_id, wor_id } = req.query as {mem_id: string, wor_id: string | null};
    apiLogEntry = await Logger.logApiStart('GET /api/workout/getWorkoutDetails', [wor_id]);
    const workouts = await getWorkouts();
    if (mem_id == null || mem_id === '') {
      const workoutDetails: WorkoutDetail[] = workouts.map((record: Workout) => ({
        WOO_ID: record.WOO_ID,
        WOO_NAME: record.WOO_NAME,
        WOO_IMG: record.WOO_IMG,
        WOO_UNIT: record.WOO_UNIT,
        WOD_GUIDE: record.WOO_GUIDE,
        WOD_TARGET_REPS: record.WOO_TARGET_REPS,
        WOD_TARGET_SETS: record.WOO_TARGET_SETS,
      }));
      return res.json({
        success: true,
        data: workoutDetails.slice(0, 3),
        wor_id: 0,        
        timestamp: new Date().toISOString()
      });
    }    
    let data = await getWorkoutDetails(Number(wor_id));
    if (data.length === 0) {
      // 데이터 오브젝트 구성
      const result = await initWorkoutRecord(Number(mem_id), new Date().toISOString().split('T')[0]);
      if (result) {
        wor_id = result.WOR_ID.toString();
      }
      else {
        res.status(500).json({
          success: false,
          error: "운동 기록 생성에 실패했습니다."
        });
        return;
      }    
      data = await getWorkoutDetails(Number(wor_id));
    }
    res.json({
      success: true,
      data: data,
      wor_id: wor_id,
      count: data.length,
      timestamp: new Date().toISOString()
    });
    await Logger.logApiSuccess(apiLogEntry);
  } catch (error) {
    console.error("❌ 운동 상세 정보 조회 중 오류 발생:", error); // 💡 오류 로그
    await Logger.logApiError(apiLogEntry, error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});
workoutRouter.get('/getWorkoutHistory', async (req, res) => {
  let apiLogEntry = null;  
  try {
    const { mem_id } = req.query as { mem_id?: string };  
    apiLogEntry = await Logger.logApiStart('GET /api/workout/getWorkoutHistory', [mem_id]);
    const workoutHistory = await getWorkoutHistory(mem_id);
    res.json({
      success: true,
      data: workoutHistory,
      timestamp: new Date().toISOString()
    });
    await Logger.logApiSuccess(apiLogEntry);
  } catch (error) {
    await Logger.logApiError(apiLogEntry, error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});
workoutRouter.post('/insertWorkoutRecord', async (req, res) => {
    let apiLogEntry = null;
    try {
        const { mem_id, wor_dt, wor_desc } = req.body;

        // 필수값 검증
        if (!mem_id) {
            return res.status(400).json({
                success: false,
                error: '회원 ID(mem_id)가 필요합니다.'
            });
        }
        apiLogEntry = await Logger.logApiStart('POST /api/insertWorkoutRecord', [mem_id, wor_dt, wor_desc]);

        const workoutData: T_WORKOUT_RECORD = {
            WOR_ID_VIEW: '', // 서비스 내부에서 생성 예정
            MEM_ID: Number(mem_id),
            // 날짜가 넘어오지 않으면 현재 날짜(YYYY-MM-DD)로 설정
            WOR_DT: wor_dt || new Date().toISOString().split('T')[0],
            WOR_DESC: wor_desc || null
        };

        const result = await insertWorkoutRecord(workoutData);

        res.json({
            success: true,
            data: result, // { WOR_ID, WOR_ID_VIEW } 리턴
            timestamp: new Date().toISOString()
        });

        await Logger.logApiSuccess(apiLogEntry);
    } catch (error) {
        if (apiLogEntry) await Logger.logApiError(apiLogEntry, error);
        res.status(500).json({
            success: false,
            error: (error as Error).message
        });
    }
});
workoutRouter.get('/getWorkouts', async (req, res) => {
  let apiLogEntry = null;
  try {
    apiLogEntry = await Logger.logApiStart('GET /api/workout/getWorkoutDetails', [] );
    const workouts = await getWorkouts();
    res.json({
      success: true,
      data: workouts,
      count: workouts.length,
      timestamp: new Date().toISOString()
    });
    await Logger.logApiSuccess(apiLogEntry);
  } catch (error) {
    console.error("❌ 운동 상세 정보 조회 중 오류 발생:", error); // 💡 오류 로그
    await Logger.logApiError(apiLogEntry, error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

// 🌟 [추가] 프론트엔드에서 보낸 운동 완료 데이터를 받는 API
// 🌟 [수정] 프론트엔드에서 보낸 운동 완료 데이터를 받고 DB에 저장하는 API
workoutRouter.post('/complete', async (req, res) => {
  let apiLogEntry = null;
  try {
    // 1. 프론트엔드에서 보낸 데이터 꺼내기 (woo_id 포함!)
    const { mem_id, wor_id, count, duration, accuracy, woo_id } = req.body;
    
    // 로그 기록
    apiLogEntry = await Logger.logApiStart('POST /api/workout/complete', [mem_id, wor_id, count, duration, accuracy, woo_id]);
    console.log("🔥 프론트에서 무사히 도착한 데이터:", req.body);

    // 💡 2. [핵심] 아까 만든 DB 함수를 여기서 드디어 실행합니다!!!
    const earnedPoint = await completeWorkoutRecord(
        Number(mem_id), 
        Number(wor_id), 
        Number(count), 
        Number(duration), 
        Number(accuracy),
        Number(woo_id)
    );

    // 3. 작업이 끝났으면 프론트엔드에 획득한 포인트와 함께 성공 응답 보내기
    res.json({
      success: true,
      message: `운동 기록 및 포인트 저장 완료! (${earnedPoint}P 획득)`,
      earnedPoint: earnedPoint,
      timestamp: new Date().toISOString()
    });

    await Logger.logApiSuccess(apiLogEntry);
  } catch (error) {
    console.error("❌ 운동 완료 처리 중 오류 발생:", error);
    await Logger.logApiError(apiLogEntry, error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});


export default workoutRouter;